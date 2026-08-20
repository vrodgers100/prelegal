import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentChat from "./DocumentChat";
import { GREETING, type DocumentUpdates } from "@/lib/chat";
import { createEmptyDocument } from "@/lib/documents";
import { readDocumentSchemas } from "@/lib/documents.server";

const SCHEMAS = readDocumentSchemas();
const nda = SCHEMAS.find((s) => s.documentType === "mutual-nda")!;
const NDA = { ...createEmptyDocument(nda), effectiveDate: "2026-08-19" };

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function turn(
  reply: string,
  updates: DocumentUpdates = {},
  documentType: string | null = "mutual-nda",
) {
  return { reply, updates, documentType };
}

function renderChat(
  { documentType = "mutual-nda" as string | null, onDocumentType = vi.fn() } = {},
) {
  const onUpdates = vi.fn();
  render(
    <DocumentChat
      documentType={documentType}
      schemas={SCHEMAS}
      data={NDA}
      onUpdates={onUpdates}
      onDocumentType={onDocumentType}
    />,
  );
  return { onUpdates, onDocumentType, user: userEvent.setup() };
}

async function say(user: ReturnType<typeof userEvent.setup>, words: string) {
  await user.type(screen.getByLabelText("Message"), words);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("DocumentChat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom has no layout, so the transcript cannot actually scroll.
    Element.prototype.scrollTo = vi.fn();
  });

  it("opens with a greeting, without calling the API", () => {
    const fetchMock = stubFetch(200, turn("unused"));

    renderChat();

    expect(screen.getByText(GREETING)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows what the user said and what came back", async () => {
    stubFetch(200, turn("Which state's law should govern?"));
    const { user } = renderChat();

    await say(user, "An NDA with Globex.");

    expect(screen.getByText("An NDA with Globex.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Which state's law should govern?")).toBeInTheDocument(),
    );
  });

  it("hands the fields it learned to the agreement", async () => {
    stubFetch(200, turn("Noted.", { governingLaw: "Delaware" }));
    const { onUpdates, user } = renderChat();

    await say(user, "Delaware law.");

    await waitFor(() =>
      expect(onUpdates).toHaveBeenCalledWith({ governingLaw: "Delaware" }),
    );
  });

  it("sends the transcript and the agreement as it stands", async () => {
    const fetchMock = stubFetch(200, turn("Noted."));
    const { user } = renderChat();

    await say(user, "Delaware law.");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.messages).toEqual([
      { role: "assistant", content: GREETING },
      { role: "user", content: "Delaware law." },
    ]);
    expect(body.fields).toEqual(NDA);
    expect(body.documentType).toBe("mutual-nda");
  });

  it("clears the composer once the message is away", async () => {
    stubFetch(200, turn("Noted."));
    const { user } = renderChat();

    await say(user, "Delaware law.");

    await waitFor(() => expect(screen.getByLabelText("Message")).toHaveValue(""));
  });

  it("will not send an empty message", async () => {
    const fetchMock = stubFetch(200, turn("unused"));
    renderChat();

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the assistant is typing while it waits", async () => {
    let answer: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve))),
    );
    const { user } = renderChat();

    await say(user, "Delaware law.");

    expect(screen.getByText("The assistant is typing")).toBeInTheDocument();

    answer({ ok: true, status: 200, json: async () => turn("Noted.") });
    await waitFor(() =>
      expect(screen.queryByText("The assistant is typing")).not.toBeInTheDocument(),
    );
  });

  describe("when a turn fails", () => {
    it("explains what the API said", async () => {
      stubFetch(503, { detail: "The drafting assistant is not configured." });
      const { user } = renderChat();

      await say(user, "Delaware law.");

      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "The drafting assistant is not configured.",
        ),
      );
    });

    it("puts the message back in the composer to be sent again", async () => {
      stubFetch(502, { detail: "The model returned an empty answer." });
      const { user } = renderChat();

      await say(user, "Delaware law.");

      await waitFor(() =>
        expect(screen.getByLabelText("Message")).toHaveValue("Delaware law."),
      );
      // The turn never happened, so it should not be left in the transcript.
      // Scoped to the transcript: the composer legitimately holds it again.
      const transcript = within(screen.getByLabelText("Conversation"));
      expect(transcript.queryByText("Delaware law.")).not.toBeInTheDocument();
    });

    it("leaves the agreement untouched", async () => {
      stubFetch(502, { detail: "The model returned an empty answer." });
      const { onUpdates, user } = renderChat();

      await say(user, "Delaware law.");

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      expect(onUpdates).not.toHaveBeenCalled();
    });
  });

  describe("the cursor", () => {
    it("returns to the composer once the assistant has answered", async () => {
      // So a conversation is one uninterrupted stream of typing: the user
      // should never have to reach for the mouse between questions.
      stubFetch(200, turn("Which state's law should govern?"));
      const { user } = renderChat();

      await say(user, "An NDA with Globex.");

      await waitFor(() =>
        expect(screen.getByLabelText("Message")).toHaveFocus(),
      );
    });

    it("returns to the composer after a failed turn too", async () => {
      // The failed message is put back in the composer, so the cursor should
      // be there to edit and resend it.
      stubFetch(502, { detail: "The model returned an empty answer." });
      const { user } = renderChat();

      await say(user, "Delaware law.");

      await waitFor(() =>
        expect(screen.getByLabelText("Message")).toHaveFocus(),
      );
    });
  });

  describe("choosing the agreement", () => {
    it("asks what to draft before one has been chosen", () => {
      stubFetch(200, turn("unused"));

      renderChat({ documentType: null });

      expect(screen.getByLabelText("Message")).toHaveAttribute(
        "placeholder",
        "Tell me what you need to draft…",
      );
    });

    it("reports the agreement the assistant settled on", async () => {
      stubFetch(200, turn("A Mutual NDA it is.", {}, "mutual-nda"));
      const { onDocumentType, user } = renderChat({ documentType: null });

      await say(user, "I need an NDA");

      await waitFor(() => expect(onDocumentType).toHaveBeenCalledWith("mutual-nda"));
    });

    it("stays on the question when nothing was settled", async () => {
      // An unsupported request is answered with an explanation and the nearest
      // match, and waits for the user to accept it.
      stubFetch(200, turn("Prelegal cannot draft an employment contract.", {}, null));
      const { onDocumentType, user } = renderChat({ documentType: null });

      await say(user, "I need an employment contract");

      await waitFor(() =>
        expect(
          screen.getByText("Prelegal cannot draft an employment contract."),
        ).toBeInTheDocument(),
      );
      expect(onDocumentType).not.toHaveBeenCalled();
    });

    it("does not re-choose once an agreement is open", async () => {
      stubFetch(200, turn("Noted.", { governingLaw: "Delaware" }, "mutual-nda"));
      const { onDocumentType, user } = renderChat({ documentType: "mutual-nda" });

      await say(user, "Delaware law.");

      await waitFor(() => expect(screen.getByText("Noted.")).toBeInTheDocument());
      expect(onDocumentType).not.toHaveBeenCalled();
    });

    it("shows all eleven agreements to pick from", () => {
      // Asking used to be the only way to find out what Prelegal drafts.
      renderChat({ documentType: null });

      const catalogue = within(screen.getByLabelText("Conversation"));
      expect(catalogue.getAllByRole("button")).toHaveLength(SCHEMAS.length);
      expect(SCHEMAS).toHaveLength(11);
      expect(catalogue.getByText("Pilot Agreement")).toBeInTheDocument();
      expect(catalogue.getByText("Design Partner Agreement")).toBeInTheDocument();
    });

    it("opens the agreement that was picked, without waiting on the API", async () => {
      // The document has to appear even when the assistant cannot be reached,
      // or an unconfigured deployment has no way into the review form at all.
      stubFetch(503, { detail: "The drafting assistant is not configured." });
      const { onDocumentType, user } = renderChat({ documentType: null });

      await user.click(screen.getByRole("button", { name: /Pilot Agreement/ }));

      expect(onDocumentType).toHaveBeenCalledWith("pilot-agreement");
    });

    it("says in the conversation what was picked", async () => {
      const fetchMock = stubFetch(200, turn("Who is the provider?", {}, "pilot-agreement"));
      const { user } = renderChat({ documentType: null });

      await user.click(screen.getByRole("button", { name: /Pilot Agreement/ }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.messages.at(-1)).toEqual({
        role: "user",
        content: "I need a Pilot Agreement.",
      });
      // Sent against the agreement just picked, not the null it replaced.
      expect(body.documentType).toBe("pilot-agreement");
    });

    it("puts the catalogue away once an agreement is open", () => {
      renderChat({ documentType: "mutual-nda" });

      const transcript = within(screen.getByLabelText("Conversation"));
      expect(transcript.queryByText("Design Partner Agreement")).not.toBeInTheDocument();
    });

    it("changes the agreement when the user asks for a different one", async () => {
      // The reported fault: the preview stayed on the NDA however plainly the
      // user asked for something else.
      stubFetch(200, turn("A pilot agreement it is.", {}, "pilot-agreement"));
      const { onDocumentType, user } = renderChat({ documentType: "mutual-nda" });

      await say(user, "Actually, make it a pilot agreement.");

      await waitFor(() =>
        expect(onDocumentType).toHaveBeenCalledWith("pilot-agreement"),
      );
    });

    it("merges nothing into an agreement it is leaving behind", async () => {
      // Those fields are keyed to the old schema; the new document starts empty.
      stubFetch(
        200,
        turn("A pilot agreement it is.", { governingLaw: "Delaware" }, "pilot-agreement"),
      );
      const { onUpdates, onDocumentType, user } = renderChat({
        documentType: "mutual-nda",
      });

      await say(user, "Actually, make it a pilot agreement.");

      await waitFor(() => expect(onDocumentType).toHaveBeenCalled());
      expect(onUpdates).not.toHaveBeenCalled();
    });
  });
});
