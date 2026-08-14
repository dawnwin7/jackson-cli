import { dash } from "@better-auth/infra";
import { betterAuth } from "better-auth/minimal";

export function createAuth() {
  return betterAuth({
    plugins: [dash()],
  });
}
