export default function BrandMark({ className = "" }: { className?: string }) {
    return (
        <span className={`brandMark ${className}`} aria-hidden="true">
            {/* Replace this with your actual SVG paths. Key: fill="currentColor" */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M..." fill="currentColor" />
            </svg>
        </span>
    );
}
