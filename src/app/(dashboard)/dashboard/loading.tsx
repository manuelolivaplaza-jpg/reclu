function Box({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[12px] bg-[#ececec] ${className}`} />;
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando resumen">
      <Box className="h-8 w-40" />
      <div className="flex gap-3 overflow-hidden sm:grid sm:grid-cols-3">
        <Box className="h-[104px] min-w-[44%] sm:min-w-0" />
        <Box className="h-[104px] min-w-[44%] sm:min-w-0" />
        <Box className="h-[104px] min-w-[44%] sm:min-w-0" />
      </div>
      <Box className="h-5 w-32" />
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        <Box className="h-16 sm:h-48" />
        <Box className="h-16 sm:h-48" />
        <Box className="h-16 sm:h-48" />
      </div>
      <Box className="h-5 w-40" />
      <Box className="h-64" />
    </div>
  );
}
