import { useEffect, useState } from 'react';
import { getSession, onAuthChange } from '../services/authService';

export default function useSession() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    getSession().then(setSession);
    const { data: sub } = onAuthChange(setSession);
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}
