import { Navigation } from "lucide-react";
import {
  googleMapsDirections,
  type PublicDestination,
} from "@/modules/professionals/directions";

export function ProfessionalDirections({
  professional,
  className = "professional-directions",
}: {
  professional: PublicDestination;
  className?: string;
}) {
  const href = googleMapsDirections(professional);
  return href ? (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Directions to ${professional.business_name} in Google Maps`}
    >
      <Navigation size={15} aria-hidden /> Directions in Google Maps
    </a>
  ) : null;
}
