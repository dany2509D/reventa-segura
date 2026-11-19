// Helpers for native <dialog> modals: light-dismiss geometry, closedby detection, and the
// top-layer exit transition fallback for browsers lacking `overlay` / discrete `display`
// transitions (Firefox and Safari).

type Box = { left: number; right: number; top: number; bottom: number };

/** True when pointer coordinates fall outside the dialog's border box (on the ::backdrop). */
export function isOutsideDialogRect(rect: Box, clientX: number, clientY: number): boolean {
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}

export function supportsClosedBy(): boolean {
  return typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
}

let supportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (typeof window === 'undefined' || !window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  // Shorthand is intentional: browsers that do not parse `allow-discrete` drop the declaration so
  // `display: none` applies immediately; `!important` avoids global reduced-motion resets.
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

export function supportsTopLayerExit(): boolean {
  return typeof window !== 'undefined' && window.CSS?.supports?.('overlay', 'auto') === true && canTransitionDisplay();
}

/**
 * Closes a modal <dialog>, running its CSS exit transition before leaving the top layer when the
 * browser does not natively support `overlay` + discrete `display` transitions.
 */
export async function closeDialogTopLayer(dialog: HTMLDialogElement, returnValue = ''): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    if (dialog.hasAttribute('data-closing')) return;
    dialog.setAttribute('data-closing', '');
    const animations = typeof dialog.getAnimations === 'function' ? dialog.getAnimations({ subtree: true }) : [];
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  if (dialog.isConnected && dialog.open) {
    dialog.close(returnValue);
  }
}
