import { PLUGIN_ID, TAB_KIND } from '../shared.js'
import { RuntimeConsole } from './RuntimeConsole.js'
import { CSS } from './styles.js'

export const inject = ['slots', 'sidebarRightTabs']

function installStyle() {
  const id = 'pg-tsy-runtime-console-style'
  let node = document.getElementById(id)
  if (node) return () => {}
  node = document.createElement('style')
  node.id = id
  node.textContent = CSS
  document.head.appendChild(node)
  return () => node?.remove()
}

export function apply(ctx) {
  ctx.effect(installStyle, 'pg-tsy-runtime: styles')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: PLUGIN_ID,
    kind: TAB_KIND,
    priority: 'extension',
    title: () => 'PG TSY',
    guide: [{
      order: 25,
      title: () => 'PG TSY Runtime',
      description: () => 'Risk-aware runtime, venue, OMS and reconciliation state.'
    }]
  }), 'pg-tsy-runtime: right sidebar type')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: PLUGIN_ID },
    RuntimeConsole
  )), 'pg-tsy-runtime: right sidebar body')
}
