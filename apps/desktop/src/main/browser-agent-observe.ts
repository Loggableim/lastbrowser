import { AGENT_BROWSER_MAX_ELEMENTS, AGENT_BROWSER_MAX_NAME_CHARS } from './browser-agent-contracts.js';
import type { AgentSnapshotElementInput } from './browser-agent-snapshots.js';

const INTERACTIVE_ROLES = new Set([
  'link', 'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'switch', 'slider', 'tab', 'menuitem'
]);

export type AccessibilityProjectionNode = {
  role: string;
  name?: string;
  tag?: string;
  disabled?: boolean;
  readonly?: boolean;
  checked?: boolean;
  expanded?: boolean;
  password?: boolean;
  value?: string;
  offscreen?: boolean;
  backendNodeId: number;
  frameRef?: string;
  rect: { x: number; y: number; width: number; height: number };
};

export type ProjectedElement = AgentSnapshotElementInput & {
  unlabeled: boolean;
  readonly: boolean;
  checked?: boolean;
  expanded?: boolean;
  password: boolean;
};

export function projectAccessibilityNodes(nodes: readonly AccessibilityProjectionNode[]): { elements: ProjectedElement[]; truncated: boolean; unsupported: string[] } {
  const interactive = nodes.filter(node => INTERACTIVE_ROLES.has(node.role));
  const sorted = [...interactive].sort((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x || left.backendNodeId - right.backendNodeId);
  const limited = sorted.slice(0, AGENT_BROWSER_MAX_ELEMENTS);
  return {
    truncated: sorted.length > AGENT_BROWSER_MAX_ELEMENTS,
    unsupported: nodes.some(node => node.role === 'closed-shadow') ? ['closed_shadow_unsupported'] : [],
    elements: limited.map(node => {
      const name = (node.name ?? '').slice(0, AGENT_BROWSER_MAX_NAME_CHARS);
      const visible = !node.offscreen && node.rect.width > 0 && node.rect.height > 0;
      return {
        backendNodeId: node.backendNodeId,
        frameRef: node.frameRef ?? 'main',
        role: node.role,
        name,
        tag: node.tag ?? node.role,
        visible,
        enabled: node.disabled !== true && node.readonly !== true,
        rectCssPx: { ...node.rect },
        unlabeled: name.length === 0,
        readonly: node.readonly === true,
        checked: node.checked,
        expanded: node.expanded,
        password: node.password === true
      };
    })
  };
}

export function preflightPointer(element: ProjectedElement, hitBackendNodeId: number | null, allowedNodeIds: ReadonlySet<number>): { ok: true } | { ok: false; code: 'not_visible' | 'disabled' | 'readonly' | 'obstructed' | 'element_missing' } {
  if (!element.visible) return { ok: false, code: 'not_visible' };
  if (element.readonly) return { ok: false, code: 'readonly' };
  if (!element.enabled) return { ok: false, code: 'disabled' };
  if (hitBackendNodeId === null) return { ok: false, code: 'element_missing' };
  if (!allowedNodeIds.has(hitBackendNodeId)) return { ok: false, code: 'obstructed' };
  return { ok: true };
}
