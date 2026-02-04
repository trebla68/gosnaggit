export default function BrandMark({ className = "", alt = "GoSnaggit" }: { className?: string; alt?: string }) {
  return (
    <img
      className={`brandMark ${className}`}
      src="/brand/logo.svg"
      alt={alt}
      width={164}
      height={164}
    />
  );
}

