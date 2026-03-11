import { useState, useRef, useEffect } from 'react';
import { Camera, Check, X, ArrowRight, FileText, Smartphone, User } from 'lucide-react';
import Tesseract from 'tesseract.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { db, Product, Client, Inventory } from '../db';
import { cn } from '../lib/utils';

type Step = 'setup' | 'scanning' | 'verifying' | 'pricing' | 'done';

interface ScannedItem {
  product: Product;
  imei: string;
}

export default function Scanner() {
  const [step, setStep] = useState<Step>('setup');
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [selectedClient, setSelectedClient] = useState<number | ''>('');
  const [selectedProduct, setSelectedProduct] = useState<number | ''>('');
  
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [currentImei, setCurrentImei] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [blurWarning, setBlurWarning] = useState(false);
  
  const [unitPrice, setUnitPrice] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    const allClients = await db.clients.toArray();
    allClients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    setClients(allClients);
    
    const activeProducts = await db.products.filter(p => !!p.active).toArray();
    activeProducts.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      
      const romA = parseInt(a.rom || '0');
      const romB = parseInt(b.rom || '0');
      if (romA !== romB) return romA - romB;
      
      const ramA = parseInt(a.ram || '0');
      const ramB = parseInt(b.ram || '0');
      return ramA - ramB;
    });
    setProducts(activeProducts);
  };

  // Camera Management
  useEffect(() => {
    if (step === 'scanning') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      alert("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;
    
    setIsProcessing(true);
    setBlurWarning(false);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = canvas.toDataURL('image/jpeg');
      
      try {
        const result = await Tesseract.recognize(imageData, 'eng', {
          logger: m => console.log(m)
        });
        
        const text = result.data.text;
        // Regex simples para encontrar IMEI (15 dígitos)
        const imeiMatch = text.match(/\b\d{15}\b/);
        
        if (imeiMatch) {
          setCurrentImei(imeiMatch[0]);
          if (navigator.vibrate) navigator.vibrate(200); // Vibração de sucesso
          setStep('verifying');
        } else {
          setBlurWarning(true);
          setTimeout(() => setBlurWarning(false), 3000);
        }
      } catch (error) {
        console.error("Erro no OCR:", error);
        setBlurWarning(true);
      }
    }
    setIsProcessing(false);
  };

  const handleVerifyConfirm = () => {
    const product = products.find(p => p.id === Number(selectedProduct));
    if (product) {
      setScannedItems([...scannedItems, { product, imei: currentImei }]);
    }
    setStep('setup'); // Volta para setup para permitir trocar de produto ou finalizar
  };

  const handleVerifyReject = () => {
    setStep('scanning'); // Tenta ler novamente
  };

  const generatePDFAndFinish = async () => {
    if (!selectedClient || !unitPrice || scannedItems.length === 0) return;
    
    const client = clients.find(c => c.id === Number(selectedClient));
    if (!client) return;

    const price = parseFloat(unitPrice.replace(',', '.'));
    const total = price * scannedItems.length;

    // 1. Gerar PDF
    const doc = new jsPDF();
    
    // Cabeçalho Fixo
    doc.setFontSize(20);
    doc.setTextColor(5, 150, 105); // Emerald 600
    doc.text("COPYCELL DISTRIBUIDORA", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Rua Fictícia, 1000 - Centro, São Paulo/SP", 14, 28);
    doc.text("WhatsApp: (11) 99999-9999", 14, 34);
    
    doc.setDrawColor(200);
    doc.line(14, 40, 196, 40);

    // Dados do Cliente
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("DADOS DO CLIENTE", 14, 50);
    doc.setFontSize(10);
    doc.text(`Nome: ${client.name}`, 14, 58);
    doc.text(`Telefone: ${client.phone}`, 14, 64);
    doc.text(`CNPJ: ${client.cnpj}`, 100, 58);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 100, 64);

    // Tabela de Produtos
    const tableData = scannedItems.map((item, index) => [
      "1", // Qtd
      item.product.name,
      item.product.gb,
      item.imei,
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['Qtd', 'Descrição', 'GB', 'IMEI 1', 'Preço']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [5, 150, 105] },
      foot: [['', '', '', 'TOTAL:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)]],
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    const pdfBase64 = doc.output('datauristring');

    // 2. Baixa no Estoque (Gatilho)
    for (const item of scannedItems) {
      const inv = await db.inventory.where('productId').equals(item.product.id!).first();
      if (inv && inv.quantity > 0) {
        await db.inventory.update(inv.id!, { quantity: inv.quantity - 1 });
      }
    }

    // 3. Salvar Venda
    await db.sales.add({
      clientId: client.id!,
      date: new Date().toISOString(),
      items: scannedItems.map(i => ({ productId: i.product.id!, imei: i.imei, price })),
      total,
      pdfBase64,
      status: 'completed'
    });

    setStep('done');
  };

  // --- Renders por Step ---

  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pb-24">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 mt-4">Nova Venda</h1>
        
        <div className="space-y-6 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          {/* Seleção de Cliente */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-600" /> Cliente
            </label>
            <select 
              value={selectedClient} 
              onChange={(e) => setSelectedClient(Number(e.target.value))}
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none"
            >
              <option value="">Selecione o cliente...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Seleção de Produto */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" /> Produto a Escanear
            </label>
            <select 
              value={selectedProduct} 
              onChange={(e) => setSelectedProduct(Number(e.target.value))}
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none"
            >
              <option value="">Selecione o modelo...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} - {p.gb}</option>)}
            </select>
          </div>

          <button 
            onClick={() => setStep('scanning')}
            disabled={!selectedClient || !selectedProduct}
            className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:bg-gray-400 shadow-xl shadow-emerald-200 active:scale-95 transition-transform"
          >
            <Camera className="w-7 h-7" /> Abrir Câmera
          </button>
        </div>

        {/* Lista de Itens Escaneados */}
        {scannedItems.length > 0 && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Itens Lidos ({scannedItems.length})</h2>
              <button 
                onClick={() => setStep('pricing')}
                className="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1"
              >
                Avançar <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {scannedItems.map((item, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border-l-4 border-emerald-500">
                  <div>
                    <p className="font-semibold text-gray-800">{item.product.name}</p>
                    <p className="text-xs text-gray-500 font-mono">IMEI: {item.imei}</p>
                  </div>
                  <Check className="w-5 h-5 text-emerald-500" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 'scanning') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
          <button onClick={() => setStep('setup')} className="text-white p-2 bg-white/20 rounded-full backdrop-blur-md">
            <X className="w-6 h-6" />
          </button>
          <span className="text-white font-medium">Aponte para o IMEI 1</span>
          <div className="w-10"></div>
        </div>
        
        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className="absolute min-w-full min-h-full object-cover" />
          
          {/* Guia Visual (Retângulo) */}
          <div className="absolute w-3/4 h-32 border-2 border-emerald-500 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center">
            <div className="w-full h-[1px] bg-red-500/50 absolute top-1/2"></div>
          </div>

          {blurWarning && (
            <div className="absolute bottom-32 bg-red-500 text-white px-6 py-2 rounded-full font-bold animate-bounce shadow-lg">
              Foto borrada! Tente novamente.
            </div>
          )}
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="bg-black pb-safe pt-6 px-8 flex justify-center">
          <button 
            onClick={captureAndScan}
            disabled={isProcessing}
            className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
          >
            {isProcessing ? <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> : <Camera className="w-8 h-8 text-gray-800" />}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'verifying') {
    const last8 = currentImei.slice(-8);
    return (
      <div className="fixed inset-0 bg-emerald-600 z-50 flex flex-col items-center justify-center p-6 text-white">
        <h2 className="text-2xl font-medium mb-2 opacity-90">Confirme o IMEI</h2>
        <p className="text-sm opacity-75 mb-12">Últimos 8 dígitos</p>
        
        <div className="text-7xl font-black tracking-widest mb-16 font-mono drop-shadow-lg">
          {last8}
        </div>
        
        <div className="flex w-full max-w-sm justify-between gap-6">
          <button 
            onClick={handleVerifyReject}
            className="flex-1 bg-white/20 hover:bg-white/30 py-6 rounded-3xl flex items-center justify-center backdrop-blur-md transition-colors"
          >
            <X className="w-12 h-12 text-white" />
          </button>
          <button 
            onClick={handleVerifyConfirm}
            className="flex-1 bg-white hover:bg-gray-100 py-6 rounded-3xl flex items-center justify-center text-emerald-600 shadow-xl transition-colors"
          >
            <Check className="w-12 h-12" />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'pricing') {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col justify-center pb-24">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <FileText className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Finalizar Romaneio</h2>
          <p className="text-gray-500 mb-8">Você leu {scannedItems.length} itens. Qual o valor unitário deste lote?</p>
          
          <div className="relative mb-8">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xl">R$</span>
            <input 
              type="number" 
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0,00"
              className="w-full text-center text-4xl font-black text-gray-900 py-4 bg-gray-50 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20"
            />
          </div>

          <button 
            onClick={generatePDFAndFinish}
            disabled={!unitPrice}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-50 shadow-lg shadow-emerald-200"
          >
            Gerar PDF e Baixar Estoque
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-emerald-600 p-6 flex flex-col items-center justify-center text-white pb-24">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-8 shadow-2xl">
          <Check className="w-12 h-12 text-emerald-600" />
        </div>
        <h1 className="text-4xl font-black mb-4 text-center">Sucesso!</h1>
        <p className="text-emerald-100 text-center mb-12 text-lg">
          Estoque atualizado e romaneio gerado.<br/>Verifique a aba "Painel" para compartilhar o PDF.
        </p>
        <button 
          onClick={() => {
            setScannedItems([]);
            setUnitPrice('');
            setStep('setup');
          }}
          className="bg-white text-emerald-600 px-8 py-4 rounded-full font-bold text-lg shadow-xl hover:scale-105 transition-transform"
        >
          Nova Venda
        </button>
      </div>
    );
  }

  return null;
}
