// src/store/useStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set, get) => ({
      // ── Graph state ──────────────────────────────────
      graph:          null,
      isLoading:      false,
      selectedNode:   null,
      activeModule:   'crypto',
      showLabels:     true,
      showFlaggedOnly:false,
      graphLayout:    'cose',
      history:        [],
      sidebarOpen:    true,

      setGraph:          (graph)   => set({ graph }),
      setLoading:        (v)       => set({ isLoading: v }),
      setSelectedNode:   (node)    => set({ selectedNode: node }),
      setActiveModule:   (mod)     => set({ activeModule: mod }),
      toggleLabels:      ()        => set(s => ({ showLabels: !s.showLabels })),
      toggleFlaggedOnly: ()        => set(s => ({ showFlaggedOnly: !s.showFlaggedOnly })),
      setGraphLayout:    (layout)  => set({ graphLayout: layout }),
      toggleSidebar:     ()        => set(s => ({ sidebarOpen: !s.sidebarOpen })),

      addToHistory: (entry) => set(s => ({
        history: [entry, ...s.history.filter(h => h.identifier !== entry.identifier || h.module !== entry.module)].slice(0, 50)
      })),

      // ── Auth state ───────────────────────────────────
      user:         null,
      accessToken:  null,
      refreshToken: null,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),

      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null, graph: null, history: [] }),

      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'cybertrail-store',
      partialize: (s) => ({
        // Only persist auth + preferences, not graph data
        user:           s.user,
        accessToken:    s.accessToken,
        refreshToken:   s.refreshToken,
        sidebarOpen:    s.sidebarOpen,
        showLabels:     s.showLabels,
        graphLayout:    s.graphLayout,
        history:        s.history,
      }),
    }
  )
)

export default useStore