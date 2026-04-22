import { PhoneFrame } from "@/components/layout/PhoneFrame";
import { RegisterClient } from "./RegisterClient";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <PhoneFrame>
      <RegisterClient />
    </PhoneFrame>
  );
}
