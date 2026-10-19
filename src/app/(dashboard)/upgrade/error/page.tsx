import { UpgradeFailure } from "@/components/upgrade-result";

export const metadata = {
  title: "Pago no concretado",
  description: "No se realizó ningún cobro.",
};

export default function UpgradeErrorPage() {
  return <UpgradeFailure />;
}
