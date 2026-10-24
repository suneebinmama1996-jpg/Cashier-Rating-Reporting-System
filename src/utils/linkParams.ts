// Online links sent to customers carry the POS number and/or cashier (?pos= / ?staff=).
// Such a page must show only the rating screen, with those values locked.

export type LinkParams = { order: string; staff: string };

export function readLinkParams(): LinkParams {
  try {
    const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const p = new URLSearchParams(searchStr);
    return {
      order: (p.get('order') || p.get('orderNumber') || p.get('pos') || '').trim(),
      staff: (p.get('staff') || p.get('cashier') || p.get('emp') || '').trim(),
    };
  } catch {
    return { order: '', staff: '' };
  }
}

export const isCustomerLink = () => {
  const p = readLinkParams();
  return !!(p.order || p.staff);
};
