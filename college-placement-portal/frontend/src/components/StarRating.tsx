type StarRatingProps = {
  rating: number;
};

export default function StarRating({ rating }: StarRatingProps) {
  const safeRating = Math.max(0, Math.min(5, rating || 0));
  const fullStars = Math.floor(safeRating);
  const hasHalf = safeRating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <div aria-label={`rating-${safeRating.toFixed(1)}`} className="inline-flex items-center gap-0.5 text-yellow-500">
      {Array.from({ length: fullStars }).map((_, i) => (
        <span key={`full-${i}`}>★</span>
      ))}
      {hasHalf && <span key="half">☆</span>}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <span key={`empty-${i}`} className="text-yellow-300">☆</span>
      ))}
    </div>
  );
}
