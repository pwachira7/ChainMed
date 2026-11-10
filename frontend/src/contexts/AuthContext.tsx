import { createContext, useContext } from "react";
import type { User } from "../services/api";
export const Context = createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
}>({ user: null, setUser: () => {} });
export const useAuth = () => useContext(Context);
