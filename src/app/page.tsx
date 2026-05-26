import PixelCanvas from "@/components/PixelCanvas";
import ComingSoon from "@/components/ComingSoon";
import { COMING_SOON } from "@/lib/config";

export default function Home() {
  return COMING_SOON ? <ComingSoon /> : <PixelCanvas />;
}
