/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UI SUBSTRATE
 * ═══════════════════════════════════════════════════════════════════════════
 */

class UISubstrate extends SubstrateBase {
  name() { return 'ui'; }

  getSchema() {
    return { hud: 'object', menus: 'array', dialogs: 'array', notifications: 'array', theme: 'object' };
  }

  extract(coordinate) {
    const raw = this.manifold.read(coordinate) || {};
    return {
      hud: raw.hud || { visible: true, position: 'bottom-left', elements: [] },
      menus: raw.menus || [],
      dialogs: raw.dialogs || [],
      notifications: raw.notifications || [],
      theme: raw.theme || { primary: '#00FFFF', secondary: '#FF00FF', accent: '#FFE800' }
    };
  }

  validate(data) {
    return data.hud && data.theme && Array.isArray(data.menus);
  }

  addNotification(message, type = 'info', duration = 3000) {
    return {
      id: `notif-${Date.now()}`,
      message, type, duration,
      timestamp: Date.now(),
      visible: true
    };
  }

  openMenu(menuId, data = {}) {
    return { menuId, data, isOpen: true, timestamp: Date.now() };
  }

  closeMenu(menuId) {
    return { menuId, isOpen: false, timestamp: Date.now() };
  }

  updateHUDElement(elementId, value) {
    return { elementId, value, updated: Date.now() };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UISubstrate;
}
if (typeof window !== 'undefined') {
  window.UISubstrate = UISubstrate;
}
