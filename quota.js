/*
 * quota.js — Suivi des quotas du forfait Freemium (côté navigateur)
 *
 * ⚠️ IMPORTANT : tant qu'il n'y a pas de compte utilisateur + base de données
 * côté serveur, ce suivi est stocké dans localStorage. C'est un garde-fou
 * "honnête" pour l'utilisateur normal, mais PAS une sécurité réelle : vider
 * le cache, utiliser la navigation privée ou changer de navigateur permet de
 * contourner la limite. Dès qu'un vrai système de comptes/paiement existera,
 * cette logique devra être déplacée côté serveur (et vérifiée à chaque appel
 * API, pas seulement côté client).
 *
 * Règles du forfait Freemium (Genesis) :
 *   - 1 visuel exporté par semaine glissante sur Visuel Studio
 *   - 1 carrousel offert par mois glissant
 *   - Export PDF standard autorisé
 *   - Pas d'accès à l'export PowerPoint
 */
(function (global) {
  const STORAGE_KEY = 'cs_freemium_usage';
  const PLAN_KEY = 'cs_plan';
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

  function getUsage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function setUsage(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* stockage indisponible (navigation privée stricte, etc.) */ }
  }

  // Pas encore de système de comptes/paiement : tout le monde est "freemium"
  // par défaut. Une fois l'authentification/le paiement en place, cette
  // fonction devra lire le vrai forfait de l'utilisateur connecté.
  function getPlan() {
    return localStorage.getItem(PLAN_KEY) || 'freemium';
  }

  function daysLeft(ms) {
    return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }

  const CSQuota = {
    getPlan,

    // Visuel Studio : 1 export / semaine glissante
    canExportVisuel() {
      if (getPlan() !== 'freemium') return { allowed: true };
      const usage = getUsage();
      const last = usage.lastVisuelExport;
      if (!last) return { allowed: true };
      const elapsed = Date.now() - last;
      if (elapsed >= WEEK_MS) return { allowed: true };
      const days = daysLeft(WEEK_MS - elapsed);
      return {
        allowed: false,
        message: `Quota Freemium atteint : 1 visuel par semaine. Réessaie dans ${days} jour${days > 1 ? 's' : ''}, ou passe à un forfait supérieur pour un accès illimité.`
      };
    },
    recordVisuelExport() {
      const usage = getUsage();
      usage.lastVisuelExport = Date.now();
      setUsage(usage);
    },

    // Éditeur de carrousels : 1 carrousel offert par mois glissant
    canUseCarrousel() {
      if (getPlan() !== 'freemium') return { allowed: true };
      const usage = getUsage();
      const last = usage.lastCarrouselUsed;
      if (!last) return { allowed: true };
      const elapsed = Date.now() - last;
      if (elapsed >= MONTH_MS) return { allowed: true };
      const days = daysLeft(MONTH_MS - elapsed);
      return {
        allowed: false,
        message: `Quota Freemium atteint : 1 carrousel offert par mois. Réessaie dans ${days} jour${days > 1 ? 's' : ''}, ou passe à un forfait payant pour créer d’autres carrousels dès maintenant.`
      };
    },
    recordCarrouselUsed() {
      const usage = getUsage();
      usage.lastCarrouselUsed = Date.now();
      setUsage(usage);
    },

    // Export PowerPoint : jamais disponible en Freemium
    canExportPowerPoint() {
      if (getPlan() !== 'freemium') return { allowed: true };
      return {
        allowed: false,
        message: 'L’export PowerPoint n’est pas inclus dans le forfait Freemium. Passe au forfait Premium ou Premium+ pour y accéder.'
      };
    },

    // Petit bandeau/alerte réutilisable
    notify(message) {
      if (typeof global.showToast === 'function') { global.showToast(message); return; }
      if (typeof global.toast === 'function') { global.toast(message, true); return; }
      alert(message);
    }
  };

  global.CSQuota = CSQuota;
})(window);
