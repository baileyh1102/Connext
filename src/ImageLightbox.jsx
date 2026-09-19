// ImageLightbox shows an expanded image or video attachment in a full-screen
// overlay. Click the backdrop or the ✕ to close.
function ImageLightbox({ url, type, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-gray-300 text-2xl"
        title="Close"
      >
        ✕
      </button>

      {type === 'image' ? (
        <img
          src={url}
          alt="Expanded attachment"
          onClick={(e) => e.stopPropagation()}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded"
        />
      ) : (
        <video
          src={url}
          controls
          autoPlay
          onClick={(e) => e.stopPropagation()}
          className="max-w-[90vw] max-h-[90vh] rounded"
        />
      )}
    </div>
  )
}

export default ImageLightbox