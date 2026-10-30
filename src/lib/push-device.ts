"use client";
import { browserClient } from './supabase/client';
export async function disconnectPushDevice() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    if (!(await subscription.unsubscribe())) throw Error('No se pudo desconectar el dispositivo.');
    // Once unsubscribed, the provider cannot deliver; stale records are removed on 404/410.
    await browserClient().rpc('push_manage', { action: 'unsubscribe', payload: { endpoint } });
  }
  const notifications = await registration?.getNotifications();
  notifications?.forEach(notification => notification.close());
}
