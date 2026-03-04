import "./CenteredLoader.css"

type CenteredLoaderProps = {
  message?: string
  label?: string
}

export default function CenteredLoader({ message, label }: CenteredLoaderProps) {
  const text = message ?? label ?? "Загрузка…"
  return (
    <div className="centered-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="centered-loader__content">
        <div className="centered-loader__dots" aria-hidden="true">
          <span className="centered-loader__dot centered-loader__dot--one" />
          <span className="centered-loader__dot centered-loader__dot--two" />
          <span className="centered-loader__dot centered-loader__dot--three" />
        </div>
        <div className="centered-loader__label">{text}</div>
      </div>
    </div>
  )
}
