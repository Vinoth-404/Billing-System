import { useState } from "react";
import axios from "axios";
import { useSettings } from "../context/SettingsContext";
import {
  Barcode,
  Printer,
  Download,
  Trash2,
  RefreshCw,
  AlertTriangle,
  FileText
} from "lucide-react";

const API = import.meta.env.VITE_API_URL;

function BarcodeCenter() {
  const { settings } = useSettings();
  const [articleNumber, setArticleNumber] = useState("");
  const [mrp, setMrp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedProduct, setGeneratedProduct] = useState(null);
  
  // State for browser printing
  const [printLabel, setPrintLabel] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);

  // Helper to convert image URL to base64 Data URL
  const getBase64FromUrl = async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Generate / Lookup Barcode Action
  const handleGenerate = (e) => {
    if (e) e.preventDefault();
    if (!articleNumber.trim()) {
      setError("Article Number is required.");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedProduct(null);

    const artNo = articleNumber.trim();
    axios
      .get(`${API}/api/products/article/${encodeURIComponent(artNo)}`)
      .then((res) => {
        setGeneratedProduct(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error looking up article number:", err);
        setError(
          err.response?.status === 404
            ? `Product with Article Number "${artNo}" not found. Please register the product first.`
            : "Failed to generate barcode. Please check your network connection."
        );
        setLoading(false);
      });
  };

  // Download Barcode Label as high-res PNG image
  const handleDownloadPNG = async () => {
    if (!generatedProduct?.barcode) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 460;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");

      // White background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Border simulation
      ctx.strokeStyle = "#94A3B8";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
      ctx.setLineDash([]);

      let currentY = 50;

      // 1. Article Number
      ctx.fillStyle = "#334155";
      ctx.font = "bold 22px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`Art No: ${generatedProduct.article_number}`, canvas.width / 2, currentY);
      currentY += 28;

      // 2. Barcode Image
      const barcodeUrl = `${API}/api/barcode/image/${generatedProduct.barcode}`;
      const barcodeImg = new Image();
      barcodeImg.crossOrigin = "anonymous";
      barcodeImg.src = barcodeUrl;
      await new Promise((resolve, reject) => {
        barcodeImg.onload = resolve;
        barcodeImg.onerror = reject;
      });

      const barcodeWidth = 350;
      const barcodeHeight = 90;
      ctx.drawImage(barcodeImg, (canvas.width - barcodeWidth) / 2, currentY, barcodeWidth, barcodeHeight);
      currentY += barcodeHeight + 28;

      // 3. Barcode Value Text
      ctx.fillStyle = "#64748B";
      ctx.font = "bold 18px monospace";
      ctx.fillText(generatedProduct.barcode, canvas.width / 2, currentY);
      currentY += 36;

      // 4. Prices (MRP strikethrough & Selling Price)
      const sellingStr = `₹${Number(generatedProduct.selling_price).toLocaleString("en-IN")}`;
      if (mrp && !isNaN(Number(mrp)) && Number(mrp) > 0) {
        const mrpStr = `₹${Number(mrp).toLocaleString("en-IN")}`;
        ctx.font = "20px Outfit, Inter, sans-serif";
        const mrpWidth = ctx.measureText(mrpStr).width;
        
        ctx.font = "bold 22px Outfit, Inter, sans-serif";
        const sellingWidth = ctx.measureText(sellingStr).width;
        const gap = 18;
        const totalWidth = mrpWidth + gap + sellingWidth;
        const startX = (canvas.width - totalWidth) / 2;

        // Draw MRP
        ctx.textAlign = "left";
        ctx.fillStyle = "#94A3B8";
        ctx.font = "20px Outfit, Inter, sans-serif";
        ctx.fillText(mrpStr, startX, currentY);

        // Draw Strikethrough line
        ctx.strokeStyle = "#94A3B8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX - 2, currentY - 7);
        ctx.lineTo(startX + mrpWidth + 2, currentY - 7);
        ctx.stroke();

        // Draw Selling Price
        ctx.fillStyle = "#0F172A";
        ctx.font = "bold 22px Outfit, Inter, sans-serif";
        ctx.fillText(sellingStr, startX + mrpWidth + gap, currentY);
      } else {
        ctx.fillStyle = "#0F172A";
        ctx.font = "bold 22px Outfit, Inter, sans-serif";
        ctx.fillText(sellingStr, canvas.width / 2, currentY);
      }

      // Trigger Download
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${generatedProduct.barcode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Canvas PNG generation failed:", err);
      alert("Failed to download barcode PNG image.");
    }
  };

  // Download custom 58mm x 40mm Label PDF
  const handleDownloadPDF = async () => {
    if (!generatedProduct?.barcode) return;
    try {
      const { jsPDF } = await import("jspdf");
      
      // Page dimensions: 58mm width, 40mm height
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: [58, 40]
      });

      let currentY = 8;

      // 1. Draw Article Number
      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.text(`Art No: ${generatedProduct.article_number}`, 29, currentY, { align: "center" });
      currentY += 5;

      // 2. Draw Barcode Image (Width: 46mm, Height: 12mm)
      const barcodeUrl = `${API}/api/barcode/image/${generatedProduct.barcode}`;
      const barcodeDataUrl = await getBase64FromUrl(barcodeUrl);
      doc.addImage(barcodeDataUrl, "PNG", 6, currentY, 46, 12);
      currentY += 15;

      // 3. Draw Barcode Value Text under the barcode
      doc.setFont("courier", "bold");
      doc.setFontSize(8);
      doc.text(generatedProduct.barcode, 29, currentY, { align: "center" });
      currentY += 6;

      // 4. Draw Prices (MRP strikethrough & Inventory Selling Price)
      const sellingStr = `Rs. ${Number(generatedProduct.selling_price).toLocaleString("en-IN")}`;

      if (mrp && !isNaN(Number(mrp)) && Number(mrp) > 0) {
        const mrpStr = `Rs. ${Number(mrp).toLocaleString("en-IN")}`;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const mrpWidth = doc.getTextWidth(mrpStr);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const sellingWidth = doc.getTextWidth(sellingStr);

        const gap = 3;
        const totalW = mrpWidth + gap + sellingWidth;
        const startX = (58 - totalW) / 2;

        // Draw MRP text
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(mrpStr, startX, currentY);

        // Draw strikethrough line over MRP
        doc.setLineWidth(0.35);
        doc.setDrawColor(120, 120, 120);
        doc.line(startX, currentY - 0.9, startX + mrpWidth, currentY - 0.9);

        // Draw Selling Price text next to MRP
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(sellingStr, startX + mrpWidth + gap, currentY);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(sellingStr, 29, currentY, { align: "center" });
      }

      doc.save(`${generatedProduct.barcode}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF document.");
    }
  };

  // Print Barcode Label
  const handlePrint = () => {
    if (!generatedProduct) return;
    setPrintLoading(true);

    axios
      .post(`${API}/api/barcode/print/${generatedProduct.id}`, { copies: 1 })
      .then((res) => {
        if (res.data) {
          setPrintLabel({ ...res.data, userMrp: mrp });
          setTimeout(() => {
            window.print();
            setPrintLoading(false);
          }, 350);
        } else {
          setPrintLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to generate printing data:", err);
        alert("Failed to compile printing layout.");
        setPrintLoading(false);
      });
  };

  // Clear inputs and output fields
  const handleClear = () => {
    setArticleNumber("");
    setMrp("");
    setGeneratedProduct(null);
    setError("");
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header Info */}
      <div className="border-b border-brand-border pb-4 flex justify-between items-center no-print">
        <div>
          <h1 className="text-[44px] font-bold tracking-tight text-brand-text leading-tight">Barcode Center</h1>
          <p className="text-[18px] font-medium text-brand-subtext mt-1">Generate scannable slipper box labels instantly using article numbers</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 no-print">
        {/* Left Side: Generator Form */}
        <div className="glass-card rounded-2xl p-7 shadow-premium bg-white space-y-6">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Article Number *
              </label>
              <input
                type="text"
                value={articleNumber}
                onChange={(e) => setArticleNumber(e.target.value)}
                placeholder="Enter Article Number (e.g. ART-1001)"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-bold uppercase tracking-wide outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 transition-all"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                MRP / Original Price
              </label>
              <input
                type="number"
                step="0.01"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                placeholder="Enter MRP / Original Price"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-bold tracking-wide outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-accent text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all disabled:opacity-60"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <Barcode className="h-5 w-5" />
              )}
              <span>Generate Barcode</span>
            </button>
          </form>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[15px] font-bold text-brand-danger flex items-start gap-2.5 animate-shake">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {generatedProduct && (
            <div className="border-t border-brand-border pt-6 space-y-4 animate-slide-up">
              <h3 className="text-[20px] font-bold text-brand-text">Barcode Specifications</h3>
              
              <div className="grid grid-cols-2 gap-4 text-[16px] font-semibold text-brand-text">
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Article Number</span>
                  <span className="text-[16px] font-bold text-brand-accent mt-0.5 block">{generatedProduct.article_number}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Barcode Value</span>
                  <span className="text-[16px] font-mono font-bold text-slate-700 mt-0.5 block">{generatedProduct.barcode}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block mb-1">Generated Barcode (Code-128)</span>
                  <div className="bg-white border border-brand-border rounded-xl p-4 flex justify-center items-center">
                    <img
                      src={`${API}/api/barcode/image/${generatedProduct.barcode}`}
                      alt="Code-128 Barcode"
                      className="h-16 object-contain mix-blend-multiply"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Sticker Preview and Control Actions */}
        {generatedProduct && (
          <div className="glass-card rounded-2xl p-7 shadow-premium bg-white flex flex-col justify-between space-y-6 animate-slide-up">
            <div>
              <h3 className="text-[20px] font-bold text-brand-text mb-4">Preview</h3>
              
              {/* Box Sticker Label Preview Box */}
              <div className="max-w-[260px] mx-auto border border-dashed border-slate-400 p-6 rounded-xl text-center flex flex-col items-center justify-between gap-3 bg-slate-50 shadow-inner min-h-[190px]">
                {/* Article Number */}
                <div className="text-[15px] font-mono font-bold text-slate-800">
                  Art No: {generatedProduct.article_number}
                </div>

                {/* Barcode Code-128 */}
                <img
                  src={`${API}/api/barcode/image/${generatedProduct.barcode}`}
                  alt="Sticker Barcode"
                  className="h-14 object-contain mix-blend-multiply"
                />

                {/* Barcode Text Value */}
                <div className="font-mono text-[13px] font-bold text-slate-500">
                  {generatedProduct.barcode}
                </div>

                {/* Price Display: MRP (Strikethrough) & Selling Price */}
                <div className="text-[16px] font-bold text-slate-900 mt-1 flex items-center justify-center gap-2.5">
                  {mrp && !isNaN(Number(mrp)) && Number(mrp) > 0 && (
                    <span className="line-through text-slate-400 font-medium">
                      ₹{Number(mrp).toLocaleString("en-IN")}
                    </span>
                  )}
                  <span>₹{Number(generatedProduct.selling_price).toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-brand-border">
              <button
                onClick={handlePrint}
                disabled={printLoading}
                className="flex items-center justify-center gap-1.5 h-12 px-4 rounded-xl bg-brand-accent text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all disabled:opacity-60"
              >
                {printLoading ? (
                  <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Printer className="h-4.5 w-4.5" />
                )}
                <span>Print Barcode</span>
              </button>

              <button
                onClick={handleDownloadPNG}
                className="flex items-center justify-center gap-1.5 h-12 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-[15px] font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all"
              >
                <Download className="h-4.5 w-4.5" />
                <span>Download PNG</span>
              </button>

              <button
                onClick={handleDownloadPDF}
                className="flex items-center justify-center gap-1.5 h-12 px-4 rounded-xl border border-slate-300 bg-slate-50 text-[15px] font-bold text-slate-700 hover:bg-slate-200 transition-all"
              >
                <FileText className="h-4.5 w-4.5 text-brand-accent" />
                <span>Download PDF</span>
              </button>

              <button
                onClick={handleClear}
                className="flex items-center justify-center gap-1.5 h-12 px-4 rounded-xl border border-red-200 bg-red-50 text-[15px] font-bold text-brand-danger hover:bg-brand-danger hover:text-white transition-all"
              >
                <Trash2 className="h-4.5 w-4.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Printable Area - Hidden on Screen, active during window.print() */}
      {printLabel && (
        <div className="hidden print:block">
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #print-zone, #print-zone * {
                visibility: visible !important;
              }
              #print-zone {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                background: white !important;
              }
              @page {
                margin: 0;
              }
            }
          `}</style>
          <div id="print-zone" className="w-[58mm] mx-auto p-2 bg-white flex flex-col items-center justify-center">
            <div className="w-[52mm] min-h-[120px] p-2 text-center bg-white flex flex-col items-center justify-center gap-2 break-inside-avoid page-break-after-always shadow-none">
              {/* Article Number */}
              <div className="text-[11px] font-mono font-bold text-slate-800">
                Art No: {printLabel.product.article_number}
              </div>

              {/* Code-128 Barcode Image */}
              <img
                src={printLabel.barcodeDataUrl}
                alt="Barcode"
                className="h-11 object-contain my-1"
              />

              {/* Barcode Value */}
              <div className="text-[9px] font-mono font-bold text-slate-600">
                {printLabel.product.barcode}
              </div>

              {/* Price Display: MRP (Strikethrough) & Selling Price */}
              <div className="text-[11px] font-bold text-slate-900 mt-1 flex items-center justify-center gap-2">
                {printLabel.userMrp && !isNaN(Number(printLabel.userMrp)) && Number(printLabel.userMrp) > 0 && (
                  <span className="line-through text-slate-500 font-medium mr-1">
                    ₹{Number(printLabel.userMrp).toLocaleString("en-IN")}
                  </span>
                )}
                <span>₹{Number(printLabel.product.selling_price).toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BarcodeCenter;
