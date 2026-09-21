/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from "react";
export default function Image({
  unoptimized,
  priority,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  unoptimized?: boolean;
  priority?: boolean;
}) {
  void unoptimized;
  void priority;
  return <img {...props} alt={props.alt} />;
}
