import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NdaChat from "./NdaChat";
import { GREETING, type NdaUpdates } from "@/lib/chat";
import { createEmptyNda } from "@/lib/nda";

const NDA = createEmptyNda("2026-08-19");

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function turn(reply: string, updates: NdaUpdates = {}) {
  return { reply, updates };
}

function renderChat(onUpdates = vi.fn()) {
  render(<NdaChat data={NDA} onUpdates={onUpdates} />);
  return { onUpdates, user: userEvent.setup() };
}

async function say(user: ReturnType<typeof userEvent.setup>, words: string) {
  await user.type(screen.getByLabelText("Message"), words);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("NdaChat", () => {
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
});
