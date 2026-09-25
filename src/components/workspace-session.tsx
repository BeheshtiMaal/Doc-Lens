"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type WorkspaceSession = {
  workspaceId: string;
  accessToken: string;
  pageGeneration: string;
};

type SessionState = { session: WorkspaceSession | null; status: "loading" | "ready" | "ended" };
const WorkspaceSessionContext = createContext<SessionState>({ session: null, status: "loading" });
const STORAGE_KEY = "doclens.workspace.v1";

async function createSession(): Promise<WorkspaceSession> {
  const response = await fetch("/api/workspaces", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create" }),
  });
  if (!response.ok) throw new Error("A new private workspace could not be created.");
  return response.json() as Promise<WorkspaceSession>;
}

async function resumeSession(credentials: Pick<WorkspaceSession, "workspaceId" | "accessToken">) {
  const response = await fetch("/api/workspaces", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "resume", credentials }),
  });
  if (!response.ok) return null;
  return await response.json() as WorkspaceSession;
}

function acquireTabClaim(workspaceId: string) {
  if (!navigator.locks) {
    if (!globalThis.BroadcastChannel) return Promise.resolve<null | (() => void)>(null);
    return new Promise<null | (() => void)>((resolve) => {
      const channel = new BroadcastChannel("doclens:workspace-tabs");
      let occupied = false;
      channel.onmessage = (event: MessageEvent<{ type?: string; workspaceId?: string }>) => {
        if (event.data?.type === "probe" && event.data.workspaceId === workspaceId) {
          occupied = true;
          channel.postMessage({ type: "occupied", workspaceId });
        } else if (event.data?.type === "occupied" && event.data.workspaceId === workspaceId) {
          occupied = true;
        }
      };
      channel.postMessage({ type: "probe", workspaceId });
      setTimeout(() => {
        if (occupied) {
          channel.close();
          resolve(null);
        } else {
          resolve(() => channel.close());
        }
      }, 150);
    });
  }
  let release: (() => void) | undefined;
  let settle!: (claim: null | (() => void)) => void;
  const ready = new Promise<null | (() => void)>((resolve) => { settle = resolve; });
  void navigator.locks.request(`doclens:${workspaceId}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
    if (!lock) { settle(null); return; }
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    release = finish;
    settle(() => release?.());
    await held;
  }).catch(() => settle(null));
  return ready;
}

async function initializeSession() {
  const stored = sessionStorage.getItem(STORAGE_KEY);
  let previous: Pick<WorkspaceSession, "workspaceId" | "accessToken"> | null = null;
  if (stored) {
    try {
      const value = JSON.parse(stored) as WorkspaceSession;
      if (typeof value.workspaceId === "string" && typeof value.accessToken === "string") {
        previous = { workspaceId: value.workspaceId, accessToken: value.accessToken };
      }
    } catch { sessionStorage.removeItem(STORAGE_KEY); }
  }

  if (previous) {
    const claim = await acquireTabClaim(previous.workspaceId);
    if (claim) {
      const resumed = await resumeSession(previous);
      if (resumed) return { session: resumed, release: claim };
      claim();
      sessionStorage.removeItem(STORAGE_KEY);
      throw new Error("The saved workspace is no longer available.");
    }
  }

  const session = await createSession();
  const claim = await acquireTabClaim(session.workspaceId);
  return { session, release: claim };
}

export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, status: "loading" });
  const initialization = useRef<ReturnType<typeof initializeSession> | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    let active = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    const boot = async () => {
      try {
        const initialized = await (initialization.current ??= initializeSession());
        if (!active) return;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(initialized.session));
        setState({ session: initialized.session, status: "ready" });
        interval = setInterval(() => {
          void fetch("/api/workspaces/lifecycle", {
            method: "POST", headers: {
              "content-type": "application/json", authorization: `Bearer ${initialized.session.accessToken}`,
              "x-workspace-id": initialized.session.workspaceId,
            }, body: JSON.stringify({ action: "heartbeat", pageGeneration: initialized.session.pageGeneration }),
          }).then((response) => {
            if (response.status === 401 && active) {
              sessionStorage.removeItem(STORAGE_KEY);
              setState({ session: null, status: "ended" });
            }
          }).catch(() => undefined);
        }, 30_000);

        const closeHint = () => {
          void fetch("/api/workspaces/lifecycle", {
            method: "POST", keepalive: true,
            headers: {
              "content-type": "application/json", authorization: `Bearer ${initialized.session.accessToken}`,
              "x-workspace-id": initialized.session.workspaceId,
            }, body: JSON.stringify({ action: "close", pageGeneration: initialized.session.pageGeneration }),
          }).catch(() => undefined);
        };
        const restoreFromCache = (event: PageTransitionEvent) => {
          if (event.persisted) window.location.reload();
        };
        window.addEventListener("pagehide", closeHint);
        window.addEventListener("pageshow", restoreFromCache);
        return () => {
          window.removeEventListener("pagehide", closeHint);
          window.removeEventListener("pageshow", restoreFromCache);
        };
      } catch {
        if (active) setState({ session: null, status: "ended" });
      }
    };
    let removePagehide: (() => void) | undefined;
    void boot().then((cleanup) => { removePagehide = cleanup; });
    return () => {
      active = false;
      if (interval) clearInterval(interval);
      removePagehide?.();
      releaseTimer.current = setTimeout(() => {
        void initialization.current?.then(({ release }) => release?.()).catch(() => undefined);
        initialization.current = null;
      }, 0);
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  return useContext(WorkspaceSessionContext);
}
