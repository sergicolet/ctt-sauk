"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "unauthorized"; email: string }
  | { status: "authenticated"; user: User };

const AuthContext = createContext<{
  state: AuthState;
  logout: () => Promise<void>;
}>({
  state: { status: "loading" },
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: "unauthenticated" });
        return;
      }
      // Verificar si el email está en la colección users
      const snap = await getDocs(
        query(collection(db, "users"), where("email", "==", user.email))
      );
      if (!snap.empty) {
        setState({ status: "authenticated", user });
      } else {
        await signOut(auth);
        setState({ status: "unauthorized", email: user.email ?? "" });
      }
    });
    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
    setState({ status: "unauthenticated" });
  };

  return (
    <AuthContext.Provider value={{ state, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
