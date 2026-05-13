/**
 * HermesBrowser v2 — JSDoc Type Definitions
 * Full data model for workspace browser + AI orchestration.
 */

/**
 * @typedef {Object} WorkspaceData
 * @property {string} id
 * @property {string} name
 * @property {string} icon  - emoji
 * @property {string} color  - hex color
 * @property {string} sessionPartition  - Electron session partition
 * @property {number} order
 * @property {boolean} isPaused
 * @property {boolean} isSleeping
 * @property {string} downloadPath
 * @property {boolean} useGlobalDownloadPath
 * @property {string} customUserAgent
 * @property {boolean} focusModeEnabled
 * @property {Array<import('./constants').FOCUS_RULE>} distractionRules
 * @property {string|null} splitLayoutId
 * @property {boolean} tabSetAutoSave
 * @property {number} tabSetAutoSaveMinutes
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} AppShortcutData
 * @property {string} id
 * @property {string} name
 * @property {string} url
 * @property {string} icon  - favicon URL or emoji
 * @property {string} workspaceId
 * @property {number} order
 * @property {boolean} isMuted
 * @property {boolean} isSuspended
 * @property {boolean} isPinned
 * @property {string} customUserAgent
 * @property {number} zoomLevel
 * @property {Array<AccountData>} accounts
 * @property {number} badgeCount
 * @property {boolean} hasNotification
 */

/**
 * @typedef {Object} AccountData
 * @property {string} id
 * @property {string} appShortcutId
 * @property {string} label
 * @property {string} sessionPartition
 * @property {boolean} isActive
 * @property {string} profileColor
 * @property {string} lastUsed
 */

/**
 * @typedef {Object} TabData
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} favicon
 * @property {string} workspaceId
 * @property {string|null} appShortcutId
 * @property {string|null} accountId
 * @property {number} order
 * @property {boolean} isPinned
 * @property {boolean} isSuspended
 * @property {boolean} isMuted
 * @property {boolean} isLoading
 * @property {boolean} canGoBack
 * @property {boolean} canGoForward
 * @property {number} zoomLevel
 * @property {string} sessionPartition
 * @property {string} lastAccessed
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ClosedTabData
 * @property {string} id
 * @property {TabData} tab
 * @property {string} closedAt
 * @property {string} workspaceId
 */

/**
 * @typedef {Object} TabSetData
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {string} workspaceId
 * @property {string[]} tabIds  - ordered tab IDs
 * @property {number} order
 * @property {boolean} isPinned
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} SplitViewData
 * @property {string} id
 * @property {string} workspaceId
 * @property {string} layout  - SPLIT_LAYOUT key
 * @property {Array<SplitPanelData>} panels
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} SplitPanelData
 * @property {string} id
 * @property {string} tabId
 * @property {number} position  - index in layout
 * @property {number} size  - flex ratio
 * @property {boolean} isActive
 */

/**
 * @typedef {Object} FocusSessionData
 * @property {string} id
 * @property {string} type  - FOCUS_TYPES
 * @property {number} durationMinutes
 * @property {number} elapsedSeconds
 * @property {string} status  - running, paused, stopped, completed
 * @property {string} startedAt
 * @property {string} workspaceId
 * @property {boolean} notificationsMuted
 * @property {boolean} badgesHidden
 * @property {boolean} soundsMuted
 */

/**
 * @typedef {Object} DistractionRuleData
 * @property {string} id
 * @property {string} pattern  - URL pattern (glob)
 * @property {string} action  - block, redirect, warn
 * @property {string} redirectUrl
 * @property {string} schedule  - always, focus_mode_only
 * @property {string} workspaceId
 */

/**
 * @typedef {Object} UserTaskData
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} workspaceId
 * @property {string|null} pinnedToTabId
 * @property {string|null} pinnedToAppId
 * @property {boolean} isCompleted
 * @property {number} order
 * @property {string} priority  - low, medium, high, critical
 * @property {string|null} dueDate
 * @property {string|null} assignedTo
 * @property {string[]} labels
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} KanbanBoardData
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} workspaceId
 * @property {number} order
 * @property {string} color
 * @property {string[]} columnOrder  - ordered column IDs
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} KanbanColumnData
 * @property {string} id
 * @property {string} boardId
 * @property {string} title
 * @property {number} order
 * @property {string} color
 * @property {number} wipLimit  - max cards in this column (0 = unlimited)
 * @property {string[]} cardOrder  - ordered card IDs
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} KanbanCardData
 * @property {string} id
 * @property {string} boardId
 * @property {string} columnId
 * @property {string} title
 * @property {string} description
 * @property {number} order
 * @property {string} priority  - low, medium, high, critical
 * @property {string[]} labels
 * @property {string|null} assignedTo  - agent ID
 * @property {string|null} dueDate
 * @property {number|null} estimatedHours
 * @property {string|null} sprint
 * @property {string[]} comments  - array of CommentData
 * @property {string|null} linkedTabId
 * @property {string|null} linkedUrl
 * @property {string|null} linkedBranch
 * @property {string|null} linkedFile
 * @property {string|null} aiPrompt
 * @property {boolean} isBlocked
 * @property {string|null} blockedReason
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} CommentData
 * @property {string} id
 * @property {string} text
 * @property {string} author  - 'user' or agent name
 * @property {string} createdAt
 */

/**
 * @typedef {Object} AgentProfileData
 * @property {string} id
 * @property {string} name
 * @property {string} role  - AGENT_ROLES
 * @property {string} model
 * @property {string} provider
 * @property {number} maxTokens
 * @property {number} temperature
 * @property {boolean} enabled
 * @property {number} maxConcurrentTasks
 * @property {string|null} systemPrompt
 * @property {Object} capabilities
 * @property {number} totalTasksRun
 * @property {number} totalTokensUsed
 * @property {number} successRate
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} WorkerJobData
 * @property {string} id
 * @property {string} type  - code, research, review, test, deploy, etc.
 * @property {string} status  - queued, running, completed, failed, cancelled, retrying
 * @property {string} priority  - low, medium, high, critical
 * @property {string|null} parentJobId
 * @property {string[]} childJobIds
 * @property {string} agentId
 * @property {string|null} cardId  - linked kanban card
 * @property {Object} input  - task input data
 * @property {Object|null} output  - task result
 * @property {string|null} error
 * @property {number} retryCount
 * @property {number} maxRetries
 * @property {number} progress  - 0-100
 * @property {number|null} timeoutMs
 * @property {number} tokensUsed
 * @property {number} estimatedCost
 * @property {string} createdAt
 * @property {string} startedAt
 * @property {string} completedAt
 */

/**
 * @typedef {Object} CronJobData
 * @property {string} id
 * @property {string} name
 * @property {string} schedule  - cron expression
 * @property {string} taskType  - maintenance, backup, review, testing, cleanup, etc.
 * @property {Object} config  - job-specific config
 * @property {boolean} enabled
 * @property {number} maxRetries
 * @property {string|null} lastRunAt
 * @property {string|null} lastRunStatus  - success, failed
 * @property {string|null} nextRunAt
 * @property {string} createdAt
 */

/**
 * @typedef {Object} PipelineData
 * @property {string} id
 * @property {string} name
 * @property {string[]} steps  - ordered step names
 * @property {Object} stepConfig  - stepName -> { enabled, agentId, timeoutMs }
 * @property {string} status  - idle, running, completed, failed
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} GitRepoData
 * @property {string} id
 * @property {string} name
 * @property {string} localPath
 * @property {string} remoteUrl
 * @property {string} defaultBranch
 * @property {string} currentBranch
 * @property {string|null} lastCommitHash
 * @property {string} createdAt
 */

/**
 * @typedef {Object} NotificationData
 * @property {string} id
 * @property {string} appId
 * @property {string} appName
 * @property {string} title
 * @property {string} body
 * @property {string} icon
 * @property {string} type  - info, warning, error, success
 * @property {boolean} isRead
 * @property {string} timestamp
 */

module.exports = {};
