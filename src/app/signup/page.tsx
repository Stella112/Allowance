import { redirect } from "next/navigation";

// Parent sign-up is live at /parent; keep old links working.
export default function SignupPage() {
  redirect("/parent");
}
