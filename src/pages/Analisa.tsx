import { BarChart3 } from "lucide-react";

const Analisa = () => {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Analisa</h1>
          <p className="text-muted-foreground text-sm">Halaman analisa akan dibangun ulang</p>
        </div>
      </div>

      <div className="flex items-center justify-center min-h-[300px] text-muted-foreground">
        <p>Fitur analisa sedang dalam pengembangan ulang.</p>
      </div>
    </div>
  );
};

export default Analisa;
