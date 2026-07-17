'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Board, MemberWithSkills, TaskWithAssignee } from '@/types'

type BoardContextValue = {
  boards: Board[]
  members: MemberWithSkills[]
  tasks: TaskWithAssignee[]
  loadingTasks: boolean
  selectedBoardId: string | null
  setSelectedBoardId: (id: string) => void
  reloadBoards: () => Promise<void>
  reloadMembers: () => Promise<void>
  reloadTasks: () => Promise<void>
  search: string
  setSearch: (v: string) => void
  assigneeFilter: string
  setAssigneeFilter: (v: string) => void
  priorityFilter: string
  setPriorityFilter: (v: string) => void
  taskModalOpen: boolean
  editingTaskId: string | null
  openNewTaskModal: () => void
  openEditTaskModal: (id: string) => void
  closeTaskModal: () => void
  detailTaskId: string | null
  openTaskDetail: (id: string) => void
  closeTaskDetail: () => void
  overdueTasks: TaskWithAssignee[]
}

const BoardContext = createContext<BoardContextValue | null>(null)

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [boards, setBoards] = useState<Board[]>([])
  const [members, setMembers] = useState<MemberWithSkills[]>([])
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)

  const reloadBoards = useCallback(async () => {
    const res = await fetch('/api/boards')
    if (!res.ok) return
    const data: Board[] = await res.json()
    setBoards(data)
    setSelectedBoardId((current) => current ?? data[0]?.id ?? null)
  }, [])

  const reloadMembers = useCallback(async () => {
    const res = await fetch('/api/members')
    if (!res.ok) return
    const data = await res.json()
    setMembers(data)
  }, [])

  const reloadTasks = useCallback(async () => {
    if (!selectedBoardId) return
    setLoadingTasks(true)
    try {
      const res = await fetch(`/api/tasks?board_id=${selectedBoardId}`)
      if (!res.ok) return
      const data: TaskWithAssignee[] = await res.json()
      setTasks(data)
    } finally {
      setLoadingTasks(false)
    }
  }, [selectedBoardId])

  useEffect(() => {
    reloadBoards()
    reloadMembers()
  }, [reloadBoards, reloadMembers])

  useEffect(() => {
    reloadTasks()
  }, [reloadTasks])

  const overdueTasks = useMemo(() => {
    const now = new Date()
    return tasks.filter(
      (t) => t.due_date && t.status !== 'done' && new Date(t.due_date) < now
    )
  }, [tasks])

  const value: BoardContextValue = {
    boards,
    members,
    tasks,
    loadingTasks,
    selectedBoardId,
    setSelectedBoardId,
    reloadBoards,
    reloadMembers,
    reloadTasks,
    search,
    setSearch,
    assigneeFilter,
    setAssigneeFilter,
    priorityFilter,
    setPriorityFilter,
    taskModalOpen,
    editingTaskId,
    openNewTaskModal: () => {
      setEditingTaskId(null)
      setTaskModalOpen(true)
    },
    openEditTaskModal: (id: string) => {
      setEditingTaskId(id)
      setTaskModalOpen(true)
    },
    closeTaskModal: () => {
      setTaskModalOpen(false)
      setEditingTaskId(null)
    },
    detailTaskId,
    openTaskDetail: (id: string) => setDetailTaskId(id),
    closeTaskDetail: () => setDetailTaskId(null),
    overdueTasks,
  }

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
}

export function useBoardContext() {
  const ctx = useContext(BoardContext)
  if (!ctx) throw new Error('useBoardContext must be used within BoardProvider')
  return ctx
}
