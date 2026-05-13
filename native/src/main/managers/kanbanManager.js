/**
 * HermesBrowser — Kanban Board Manager
 * Full Kanban system with boards, columns, and cards.
 */
const store = require('../database/store');
const { uid, CARD_STATUSES } = require('../../shared/constants');

const BOARDS_COLLECTION = 'kanban_boards';
const COLUMNS_COLLECTION = 'kanban_columns';
const CARDS_COLLECTION = 'kanban_cards';

// ── Boards ────────────────────────────────────────────────────────────

function getBoards(workspaceId) {
  return store.findAll(BOARDS_COLLECTION, b => b.workspaceId === workspaceId)
    .sort((a, b) => a.order - b.order);
}

function getBoard(id) { return store.findOne(BOARDS_COLLECTION, b => b.id === id); }

function createBoard(data) {
  const boards = getBoards(data.workspaceId);
  const maxOrder = boards.length > 0 ? Math.max(...boards.map(b => b.order)) : -1;
  const board = {
    id: uid(),
    title: data.title || 'New Board',
    description: data.description || '',
    workspaceId: data.workspaceId,
    order: data.order !== undefined ? data.order : maxOrder + 1,
    color: data.color || '#6366f1',
    columnOrder: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const result = store.insert(BOARDS_COLLECTION, board);
  // Create default columns
  const defaultColumns = CARD_STATUSES.map((status, i) => ({
    id: uid(),
    boardId: board.id,
    title: status.replace('_', ' ').replace(/^./, s => s.toUpperCase()),
    order: i,
    color: _columnColor(status),
    wipLimit: 0,
    cardOrder: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  store.insertMany(COLUMNS_COLLECTION, defaultColumns);
  board.columnOrder = defaultColumns.map(c => c.id);
  store.updateById(BOARDS_COLLECTION, board.id, { columnOrder: board.columnOrder });
  return getBoard(board.id);
}

function _columnColor(status) {
  const colors = {
    inbox: '#6b7280', todo: '#3b82f6', planned: '#8b5cf6',
    in_progress: '#f59e0b', waiting: '#f97316', review: '#ec4899',
    testing: '#14b8a6', done: '#22c55e', archived: '#6b7280',
  };
  return colors[status] || '#6b7280';
}

function updateBoard(id, changes) {
  return store.updateById(BOARDS_COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function deleteBoard(id) {
  store.remove(COLUMNS_COLLECTION, c => c.boardId === id);
  store.remove(CARDS_COLLECTION, c => c.boardId === id);
  return store.removeById(BOARDS_COLLECTION, id);
}

// ── Columns ───────────────────────────────────────────────────────────

function getColumns(boardId) {
  const board = getBoard(boardId);
  if (!board) return [];
  const columns = store.findAll(COLUMNS_COLLECTION, c => c.boardId === boardId);
  // Sort by board.columnOrder
  const orderMap = {};
  board.columnOrder.forEach((id, i) => { orderMap[id] = i; });
  columns.sort((a, b) => (orderMap[a.id] ?? a.order) - (orderMap[b.id] ?? b.order));
  return columns;
}

function getColumn(id) { return store.findOne(COLUMNS_COLLECTION, c => c.id === id); }

function createColumn(data) {
  const existing = store.findAll(COLUMNS_COLLECTION, c => c.boardId === data.boardId);
  const maxOrder = existing.length > 0 ? Math.max(...existing.map(c => c.order)) : -1;
  const column = {
    id: uid(),
    boardId: data.boardId,
    title: data.title || 'New Column',
    order: data.order !== undefined ? data.order : maxOrder + 1,
    color: data.color || '#6b7280',
    wipLimit: data.wipLimit || 0,
    cardOrder: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const result = store.insert(COLUMNS_COLLECTION, column);
  // Update board columnOrder
  const board = getBoard(data.boardId);
  if (board) {
    board.columnOrder.push(column.id);
    store.updateById(BOARDS_COLLECTION, board.id, { columnOrder: board.columnOrder });
  }
  return column;
}

function updateColumn(id, changes) {
  return store.updateById(COLUMNS_COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function deleteColumn(id) {
  const column = getColumn(id);
  if (!column) return null;
  // Remove cards in this column
  store.remove(CARDS_COLLECTION, c => c.columnId === id);
  // Update board columnOrder
  const board = getBoard(column.boardId);
  if (board) {
    board.columnOrder = board.columnOrder.filter(cid => cid !== id);
    store.updateById(BOARDS_COLLECTION, board.id, { columnOrder: board.columnOrder });
  }
  return store.removeById(COLUMNS_COLLECTION, id);
}

function reorderColumns(boardId, columnIds) {
  const board = getBoard(boardId);
  if (!board) return null;
  board.columnOrder = columnIds;
  store.updateById(BOARDS_COLLECTION, boardId, { columnOrder: columnIds });
  columnIds.forEach((id, i) => {
    store.update(COLUMNS_COLLECTION, c => c.id === id, { order: i });
  });
  return getColumns(boardId);
}

// ── Cards ─────────────────────────────────────────────────────────────

function getCards(boardId, columnId) {
  if (columnId) {
    const column = getColumn(columnId);
    if (!column) return [];
    const cards = store.findAll(CARDS_COLLECTION, c => c.columnId === columnId);
    const orderMap = {};
    column.cardOrder.forEach((id, i) => { orderMap[id] = i; });
    cards.sort((a, b) => (orderMap[a.id] ?? a.order) - (orderMap[b.id] ?? b.order));
    return cards;
  }
  return store.findAll(CARDS_COLLECTION, c => c.boardId === boardId);
}

function getCard(id) { return store.findOne(CARDS_COLLECTION, c => c.id === id); }

function createCard(data) {
  const column = getColumn(data.columnId);
  if (!column) return null;
  const cards = getCards(data.boardId, data.columnId);
  const maxOrder = cards.length > 0 ? Math.max(...cards.map(c => c.order)) : -1;

  // Check WIP limit
  if (column.wipLimit > 0 && cards.length >= column.wipLimit) return { error: 'WIP limit reached', wipLimit: column.wipLimit };

  const card = {
    id: uid(),
    boardId: data.boardId,
    columnId: data.columnId,
    title: data.title || 'Untitled',
    description: data.description || '',
    order: data.order !== undefined ? data.order : maxOrder + 1,
    priority: data.priority || 'medium',
    labels: data.labels || [],
    assignedTo: data.assignedTo || null,
    dueDate: data.dueDate || null,
    estimatedHours: data.estimatedHours || null,
    sprint: data.sprint || null,
    comments: [],
    linkedTabId: data.linkedTabId || null,
    linkedUrl: data.linkedUrl || null,
    linkedBranch: data.linkedBranch || null,
    linkedFile: data.linkedFile || null,
    aiPrompt: data.aiPrompt || null,
    isBlocked: false,
    blockedReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const result = store.insert(CARDS_COLLECTION, card);
  // Update column cardOrder
  column.cardOrder.push(card.id);
  store.updateById(COLUMNS_COLLECTION, column.id, { cardOrder: column.cardOrder });
  return card;
}

function updateCard(id, changes) {
  return store.updateById(CARDS_COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function deleteCard(id) {
  const card = getCard(id);
  if (!card) return null;
  // Remove from column's cardOrder
  const column = getColumn(card.columnId);
  if (column) {
    column.cardOrder = column.cardOrder.filter(cid => cid !== id);
    store.updateById(COLUMNS_COLLECTION, column.id, { cardOrder: column.cardOrder });
  }
  return store.removeById(CARDS_COLLECTION, id);
}

function moveCard(cardId, targetColumnId, newOrder) {
  const card = getCard(cardId);
  if (!card) return null;
  const sourceCol = getColumn(card.columnId);
  const targetCol = getColumn(targetColumnId);
  if (!targetCol) return null;

  // Check WIP limit of target column
  const targetCards = getCards(card.boardId, targetColumnId);
  if (targetCol.wipLimit > 0 && targetCards.length >= targetCol.wipLimit && card.columnId !== targetColumnId) {
    return { error: 'WIP limit reached', wipLimit: targetCol.wipLimit };
  }

  // Remove from source column
  if (sourceCol) {
    sourceCol.cardOrder = sourceCol.cardOrder.filter(cid => cid !== cardId);
    store.updateById(COLUMNS_COLLECTION, sourceCol.id, { cardOrder: sourceCol.cardOrder });
  }

  // Add to target column
  if (newOrder !== undefined && newOrder >= 0) {
    targetCol.cardOrder.splice(newOrder, 0, cardId);
  } else {
    targetCol.cardOrder.push(cardId);
  }
  store.updateById(COLUMNS_COLLECTION, targetCol.id, { cardOrder: targetCol.cardOrder });

  return updateCard(cardId, { columnId: targetColumnId, order: newOrder ?? targetCol.cardOrder.length - 1 });
}

function reorderCards(columnId, cardIds) {
  const column = getColumn(columnId);
  if (!column) return null;
  column.cardOrder = cardIds;
  store.updateById(COLUMNS_COLLECTION, columnId, { cardOrder: cardIds });
  cardIds.forEach((id, i) => {
    store.update(CARDS_COLLECTION, c => c.id === id, { order: i });
  });
  return getCards(column.boardId, columnId);
}

// ── Card Comments ─────────────────────────────────────────────────────

function addComment(cardId, text, author) {
  const card = getCard(cardId);
  if (!card) return null;
  const comment = {
    id: uid(),
    text,
    author: author || 'user',
    createdAt: new Date().toISOString(),
  };
  card.comments.push(comment);
  store.updateById(CARDS_COLLECTION, cardId, { comments: card.comments, updatedAt: new Date().toISOString() });
  return comment;
}

function assignCard(cardId, agentId) {
  return updateCard(cardId, { assignedTo: agentId });
}

function getBoardWithColumnsAndCards(boardId) {
  const board = getBoard(boardId);
  if (!board) return null;
  const columns = getColumns(boardId);
  const allCards = getCards(boardId);
  return {
    board,
    columns: columns.map(col => ({
      ...col,
      cards: allCards.filter(c => c.columnId === col.id),
    })),
  };
}

module.exports = {
  getBoards, getBoard, createBoard, updateBoard, deleteBoard,
  getColumns, getColumn, createColumn, updateColumn, deleteColumn, reorderColumns,
  getCards, getCard, createCard, updateCard, deleteCard, moveCard, reorderCards,
  addComment, assignCard, getBoardWithColumnsAndCards,
};
