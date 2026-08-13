import { betterAuth } from "better-auth/minimal";
import { dash } from "@better-auth/infra";

export function createAuth() {
  return betterAuth({
    plugins: [
      dash()
    ]
  });
}