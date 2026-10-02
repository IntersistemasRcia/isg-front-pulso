"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UIMessage } from "ai";
import {
  deleteConversation as apiDeleteConversation,
  getConversation,
  listConversations,
  uiMessageFromStored,
} from "@/lib/chat/conversationApi";
import type { ConversationListItem } from "@/lib/chat/conversationTypes";
import { useAuth } from "@/components/providers/AuthProvider";
import { getStoredToken } from "@/utils/api";

type ConversationContextValue = {
  conversations: ConversationListItem[];
  activeId: string | null;
  loadingList: boolean;
  loadingActive: boolean;
  historyAvailable: boolean;
  /** Mensajes a aplicar en ChatPanel tras cargar una conversación. */
  pendingMessages: UIMessage[] | null;
  refreshList: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  /** ChatPanel informa el id creado al primer turno. */
  setActiveId: (id: string | null) => void;
  clearPendingMessages: () => void;
  /** Tras persistir, refresca listado (título / fecha). */
  notifyConversationUpdated: () => void;
};

const ConversationContext = createContext<ConversationContextValue | null>(
  null,
);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const { token: authToken, sessionReady } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(true);
  const [pendingMessages, setPendingMessages] = useState<UIMessage[] | null>(
    null,
  );

  const token = authToken ?? getStoredToken();

  const refreshList = useCallback(async () => {
    if (!sessionReady || !token) return;
    setLoadingList(true);
    try {
      const items = await listConversations(token);
      setConversations(items);
      setHistoryAvailable(true);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status: number }).status)
          : 0;
      if (status === 503) {
        setHistoryAvailable(false);
        setConversations([]);
      } else {
        console.warn("[ConversationProvider] list failed", err);
      }
    } finally {
      setLoadingList(false);
    }
  }, [sessionReady, token]);

  useEffect(() => {
    if (!sessionReady || !token) return;
    void refreshList();
  }, [sessionReady, token, refreshList]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (!token || !id) return;
      setLoadingActive(true);
      try {
        const detail = await getConversation(id, token);
        setActiveId(detail.id);
        setPendingMessages(detail.mensajes.map(uiMessageFromStored));
      } catch (err) {
        console.error("[ConversationProvider] load failed", err);
      } finally {
        setLoadingActive(false);
      }
    },
    [token],
  );

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setPendingMessages([]);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!token || !id) return;
      try {
        await apiDeleteConversation(id, token);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
          setPendingMessages([]);
        }
      } catch (err) {
        console.error("[ConversationProvider] delete failed", err);
        throw err;
      }
    },
    [token, activeId],
  );

  const clearPendingMessages = useCallback(() => {
    setPendingMessages(null);
  }, []);

  const notifyConversationUpdated = useCallback(() => {
    void refreshList();
  }, [refreshList]);

  const value = useMemo<ConversationContextValue>(
    () => ({
      conversations,
      activeId,
      loadingList,
      loadingActive,
      historyAvailable,
      pendingMessages,
      refreshList,
      selectConversation,
      startNewConversation,
      deleteConversation,
      setActiveId,
      clearPendingMessages,
      notifyConversationUpdated,
    }),
    [
      conversations,
      activeId,
      loadingList,
      loadingActive,
      historyAvailable,
      pendingMessages,
      refreshList,
      selectConversation,
      startNewConversation,
      deleteConversation,
      clearPendingMessages,
      notifyConversationUpdated,
    ],
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextValue {
  const ctx = useContext(ConversationContext);
  if (!ctx) {
    throw new Error(
      "useConversation debe usarse dentro de ConversationProvider",
    );
  }
  return ctx;
}
