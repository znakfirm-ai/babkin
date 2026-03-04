import "./CenteredLoader.css"

type CenteredLoaderProps = {
  label?: string
}

export default function CenteredLoader({ label = "Загрузка…" }: CenteredLoaderProps) {
  return (
    <div className="centered-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="centered-loader__content">
        <div className="centered-loader__dots" aria-hidden="true">
          <span className="centered-loader__dot centered-loader__dot--one" />
          <span className="centered-loader__dot centered-loader__dot--two" />
          <span className="centered-loader__dot centered-loader__dot--three" />
        </div>
        <div className="centered-loader__label">{label}</div>
      </div>
    </div>
  )
}
