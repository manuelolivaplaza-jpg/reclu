import { UpgradeFailure } from "@/components/upgrade-result";

export const metadata = {
  title: "Pago no concretado",
  description: "El pago no se completó y tu plan no cambió.",
};

export default function UpgradeErrorPage() {
  return <UpgradeFailure />;
}
