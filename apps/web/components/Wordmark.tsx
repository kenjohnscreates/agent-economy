// Wordmark only. The Botanica three-leaf mark is a fixed asset (brand book §20:
// "do not redraw"); drop the approved PNG/SVG at public/brand/mark.png and this
// component will show it. Until then, a Growth tile holds the space.
import Image from "next/image";

export function Wordmark() {
  return (
    <div className="wordmark">
      <span className="mark" aria-hidden="true">
        <Image src="/brand/mark.png" alt="" width={22} height={22} unoptimized />
      </span>
      <span>Botanica</span>
    </div>
  );
}
