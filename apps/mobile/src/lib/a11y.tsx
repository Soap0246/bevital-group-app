import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'bevital.a11y.largeText';

interface A11yContextValue {
  /** Multiplier applied to every <Text/>. 1 = default, 1.2 = larger text. */
  textScale: number;
  largeText: boolean;
  setLargeText: (on: boolean) => void;
}

const A11yContext = createContext<A11yContextValue>({ textScale: 1, largeText: false, setLargeText: () => {} });

/** "Larger text" preference for elderly users, in addition to the OS font-size setting. */
export function A11yProvider({ children }: { children: React.ReactNode }) {
  const [largeText, setLargeTextState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setLargeTextState(v === '1')).catch(() => {});
  }, []);

  const setLargeText = useCallback((on: boolean) => {
    setLargeTextState(on);
    AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  }, []);

  const value = useMemo(() => ({ textScale: largeText ? 1.2 : 1, largeText, setLargeText }), [largeText, setLargeText]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export const useA11y = () => useContext(A11yContext);
