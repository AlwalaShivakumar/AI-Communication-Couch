export function getGuestId(): string {
  if (typeof window !== 'undefined') {
    let id: string | null = null;
    
    // 1. Try localStorage first
    try {
      id = localStorage.getItem('guest_id');
    } catch (e) {}

    // 2. Try cookie
    if (!id && typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp('(^| )guest_id=([^;]+)'));
      if (match && match[2]) {
        id = match[2];
      }
    }

    // 3. Generate stable UUID if missing
    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
    }

    // 4. Persist to both localStorage and Cookie
    try {
      localStorage.setItem('guest_id', id);
    } catch (e) {}
    try {
      document.cookie = `guest_id=${id}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {}

    return id;
  }

  return '00000000-0000-0000-0000-000000000001';
}
