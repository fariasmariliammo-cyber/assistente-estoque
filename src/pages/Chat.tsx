import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { db, Product } from '../db';
import { cn } from '../lib/utils';
import { GoogleGenAI, Type } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface MessageOption {
  label: string;
  action: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  options?: MessageOption[];
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Olá! Sou seu assistente de estoque. Você pode me pedir coisas como:\n\n"Adicione 3 Redmi 15C 4/256"\n"Retire 2 peças de iPhone 13"\n"Qual a totalidade do meu estoque?"',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text: string, displayAs?: string) => {
    if (!text.trim()) return;

    const userMessage = text.trim();
    
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), text: displayAs || userMessage, sender: 'user', timestamp: new Date() },
    ]);

    setIsTyping(true);
    // Processar comando
    const botResponse = await processCommand(userMessage);
    setIsTyping(false);
    
    setMessages((prev) => [
      ...prev,
      { 
        id: (Date.now() + 1).toString(), 
        text: botResponse.text, 
        sender: 'bot', 
        timestamp: new Date(),
        options: botResponse.options
      },
    ]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  const [pendingAction, setPendingAction] = useState<{ type: 'add' | 'remove', quantity: number, productName: string, gb: string } | null>(null);

  const processCommand = async (text: string): Promise<{ text: string; options?: MessageOption[] }> => {
    const lowerText = text.toLowerCase();

    // Se houver uma ação pendente aguardando confirmação
    if (pendingAction) {
      if (lowerText === 'sim' || lowerText === 'confirmar' || lowerText === 'ok') {
        const { type, quantity, productName, gb } = pendingAction;
        setPendingAction(null);
        if (type === 'add') {
          return await executeUpdateStock(quantity, productName, gb);
        } else {
          return await executeUpdateStock(-quantity, productName, gb);
        }
      } else {
        setPendingAction(null);
        return { text: 'Ação cancelada. O estoque não foi alterado.' };
      }
    }

    // 1. Comando de Seleção Exata (Opção clicável)
    // Ex: "@@EXACT_ADD 3 15" (quantity, productId)
    const exactMatch = lowerText.match(/^@@exact_(add|remove)\s+(\d+)\s+(\d+)$/i);
    if (exactMatch) {
      const action = exactMatch[1].toLowerCase();
      const quantity = parseInt(exactMatch[2], 10);
      const productId = parseInt(exactMatch[3], 10);
      return await executeUpdateStock(action === 'add' ? quantity : -quantity, '', '', productId);
    }

    // 2. Processamento com Gemini para linguagem natural e filtros complexos
    return await processWithGemini(text);
  };

  const processWithGemini = async (text: string): Promise<{ text: string; options?: MessageOption[] }> => {
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: text,
        config: {
          systemInstruction: `Você é um assistente de estoque para uma loja de celulares. 
          Sua tarefa é extrair o INTENTO do usuário e os FILTROS de produto.
          
          Intenções possíveis:
          - 'add': Adicionar unidades ao estoque.
          - 'remove': Retirar unidades do estoque.
          - 'query': Consultar o estoque (filtros).
          
          Filtros possíveis (extraia apenas se mencionado):
          - brand: Marca (ex: Samsung, Apple, Xiaomi, Redmi, Poco, Motorola, Realme).
          - model: Modelo específico.
          - ram: Quantidade de RAM (apenas o número, ex: "4", "6", "8", "12").
          - rom: Quantidade de Armazenamento (apenas o número, ex: "64", "128", "256", "512").
          - network: "4G" ou "5G".
          - nfc: "Sim" ou "Não".
          
          Exemplos:
          - "quais modelos possuem NFC?" -> { intent: 'query', nfc: 'Sim' }
          - "quais modelos não tem nfc?" -> { intent: 'query', nfc: 'Não' }
          - "celulares 5G" -> { intent: 'query', network: '5G' }
          - "modelos com 8gb de ram" -> { intent: 'query', ram: '8' }
          - "estoque de iphone 13 128gb" -> { intent: 'query', model: 'iPhone 13', rom: '128' }
          - "qual a totalidade do meu estoque?" -> { intent: 'query' }
          - "adicione 5 iphone 13" -> { intent: 'add', model: 'iPhone 13', quantity: 5 }
          - "retire 2 moto g54" -> { intent: 'remove', model: 'Moto G54', quantity: 2 }`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING, enum: ['add', 'remove', 'query', 'unknown'] },
              brand: { type: Type.STRING },
              model: { type: Type.STRING },
              ram: { type: Type.STRING },
              rom: { type: Type.STRING },
              network: { type: Type.STRING },
              nfc: { type: Type.STRING },
              quantity: { type: Type.NUMBER }
            }
          }
        }
      });

      const result = JSON.parse(response.text);

      if (result.intent === 'query') {
        let allProducts = await db.products.filter(p => p.active).toArray();

        if (result.brand) {
          const brandLower = result.brand.toLowerCase();
          allProducts = allProducts.filter(p => p.brand?.toLowerCase().includes(brandLower) || p.name.toLowerCase().includes(brandLower));
        }
        if (result.model) {
          const modelLower = result.model.toLowerCase();
          allProducts = allProducts.filter(p => p.model?.toLowerCase().includes(modelLower) || p.name.toLowerCase().includes(modelLower));
        }
        if (result.ram) {
          allProducts = allProducts.filter(p => p.ram === result.ram);
        }
        if (result.rom) {
          allProducts = allProducts.filter(p => p.rom === result.rom);
        }
        if (result.network) {
          const netLower = result.network.toLowerCase();
          allProducts = allProducts.filter(p => p.network?.toLowerCase() === netLower);
        }
        if (result.nfc) {
          const nfcLower = result.nfc.toLowerCase().replace('ã', 'a');
          allProducts = allProducts.filter(p => p.nfc?.toLowerCase().replace('ã', 'a') === nfcLower);
        }

        if (allProducts.length === 0) {
          return { text: "Não encontrei nenhum modelo com essas características específicas no catálogo." };
        }

        // Ordenar alfabeticamente
        allProducts.sort((a, b) => a.name.localeCompare(b.name));

        let responseText = "Aqui estão os modelos em estoque com essas características (em ordem alfabética):\n\n";
        let totalUnits = 0;
        let foundInStock = false;

        for (const p of allProducts) {
          const inv = await db.inventory.where('productId').equals(p.id!).first();
          const qty = inv?.quantity || 0;
          if (qty > 0) {
            const specs = [
              p.ram ? `${p.ram}GB RAM` : '',
              p.rom ? `${p.rom}GB ROM` : '',
              p.network || '',
              p.nfc === 'Sim' ? 'NFC' : ''
            ].filter(Boolean).join(' | ');
            
            responseText += `📦 **${p.name}**\n   (${specs})\n   Estoque: ${qty} unidades\n\n`;
            totalUnits += qty;
            foundInStock = true;
          }
        }

        if (!foundInStock) {
          return { text: "Encontrei modelos com essas características no catálogo, mas nenhum deles possui unidades em estoque no momento." };
        }

        if (!result.brand && !result.model && !result.ram && !result.rom && !result.network && !result.nfc) {
          responseText += `📊 **Total Geral: ${totalUnits} aparelhos disponíveis.**`;
        }

        return { text: responseText };
      }

      if (result.intent === 'add' || result.intent === 'remove') {
        const qty = result.quantity || 1;
        const sign = result.intent === 'add' ? 1 : -1;
        const productName = `${result.brand || ''} ${result.model || ''}`.trim();
        const gb = result.rom ? `${result.rom}GB` : '';
        
        return await executeUpdateStock(qty * sign, productName, gb);
      }

      return { text: 'Não entendi muito bem. Tente perguntar algo como "Quais modelos 5G com NFC eu tenho?" ou "Quanto tenho de iPhone 13?"' };
    } catch (error) {
      console.error("Gemini Error:", error);
      return { text: 'Desculpe, tive um problema ao processar sua solicitação. Pode tentar novamente?' };
    }
  };

  const executeUpdateStock = async (quantity: number, productName: string, gb: string, exactProductId?: number): Promise<{ text: string; options?: MessageOption[] }> => {
    try {
      let products = exactProductId 
        ? await db.products.where('id').equals(exactProductId).toArray()
        : await db.products.filter(p => {
            const searchStr = productName.toLowerCase();
            const pName = p.name.toLowerCase();
            return searchStr.includes(pName) || pName.includes(searchStr);
          }).toArray();

      if (products.length === 0) {
        if (exactProductId) {
          return { text: 'Ocorreu um erro: o produto selecionado não foi encontrado no banco de dados.' };
        }
        if (quantity < 0) {
          return { text: `Não encontrei o produto "${productName}" para retirar do estoque.` };
        }
        const productId = await db.products.add({ name: productName, gb: gb || 'N/A', active: true });
        await db.inventory.add({ productId, quantity });
        return { text: `Adicionei ${quantity} unidades de ${productName} ${gb} ao estoque. Como é um produto novo, eu o cadastrei automaticamente para você!` };
      }

      if (products.length > 1 && !exactProductId) {
        // Try to narrow down by checking if the search string contains the GB
        const searchStr = (productName + ' ' + gb).toLowerCase();
        const narrowed = products.filter(p => searchStr.includes(p.gb.toLowerCase()));
        if (narrowed.length === 1) {
          products = narrowed;
        } else if (narrowed.length > 1) {
          products = narrowed;
        }
        
        // If still multiple, ask user
        if (products.length > 1) {
          const actionWord = quantity > 0 ? 'add' : 'remove';
          const options = products.map(p => ({
            label: `${p.name} ${p.gb}`,
            action: `@@EXACT_${actionWord} ${Math.abs(quantity)} ${p.id}`
          }));
          return {
            text: `Encontrei mais de um produto correspondente. Qual deles você deseja ${quantity > 0 ? 'adicionar' : 'retirar'}?`,
            options
          };
        }
      }

      const product = products[0];
      const productId = product.id!;
      const inventory = await db.inventory.where('productId').equals(productId).first();
      
      if (inventory) {
        const newQuantity = Math.max(0, inventory.quantity + quantity);
        await db.inventory.update(inventory.id!, { quantity: newQuantity });
        
        if (quantity > 0) {
          return { text: `Feito! Adicionei ${quantity} unidades de ${product.name} (${product.gb}) ao estoque. Total atual: ${newQuantity}.` };
        } else {
          return { text: `Retirado! Removi ${Math.abs(quantity)} unidades de ${product.name} (${product.gb}). Total restante: ${newQuantity}.` };
        }
      } else {
        if (quantity < 0) {
          return { text: `O produto "${product.name} (${product.gb})" está cadastrado, mas não possui unidades no estoque para retirar.` };
        }
        await db.inventory.add({ productId, quantity });
        return { text: `Feito! Adicionei ${quantity} unidades de ${product.name} (${product.gb}) ao estoque.` };
      }
    } catch (error) {
      console.error(error);
      return { text: 'Desculpe, ocorreu um erro ao tentar atualizar o banco de dados local.' };
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#E5DDD5]">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 shadow-md flex items-center space-x-3 z-10">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-lg leading-tight">Assistente de Estoque</h1>
          <p className="text-emerald-100 text-xs">Online e pronto</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.sender === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2 shadow-sm relative",
                msg.sender === 'user' 
                  ? "bg-[#DCF8C6] text-gray-800 rounded-tr-none" 
                  : "bg-white text-gray-800 rounded-tl-none"
              )}
            >
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              
              {msg.options && msg.options.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {msg.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(opt.action, opt.label)}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-medium transition-colors text-left"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              <span className="text-[10px] text-gray-400 block text-right mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm rounded-tl-none flex items-center space-x-2">
              <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
              <span className="text-sm text-gray-500">O assistente está pensando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-[#F0F0F0] p-3 pb-safe">
        <form onSubmit={handleSend} className="flex items-center space-x-2 bg-white rounded-full px-4 py-2 shadow-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma mensagem..."
            className="flex-1 bg-transparent border-none focus:outline-none text-gray-800 placeholder-gray-400 text-[15px]"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-gray-300 transition-colors"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>
    </div>
  );
}
