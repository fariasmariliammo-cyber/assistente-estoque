import React, { useState, useEffect } from 'react';
import { Package, Users, FileText, Settings, Search, Plus, Trash2, RotateCcw, Pencil, X } from 'lucide-react';
import { db, Product, Inventory, Client, Sale } from '../db';
import { cn } from '../lib/utils';

type Tab = 'estoque' | 'clientes' | 'produtos' | 'historico';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('estoque');
  const [inventory, setInventory] = useState<(Inventory & { product: Product })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [showClientModal, setShowClientModal] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', phone: '', address: '', street: '', city: '', state: '', zipCode: '', cnpj: '' });
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const [showProductModal, setShowProductModal] = useState(false);
  const [newProduct, setNewProduct] = useState({ brand: '', model: '', name: '', gb: '', rom: '', ram: '', network: '', nfc: '', quantity: 0 as number | string });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductDeleteConfirm, setShowProductDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    if (activeTab === 'estoque') {
      const inv = await db.inventory.toArray();
      const prods = await db.products.toArray();
      const combined = inv.map(i => ({
        ...i,
        product: prods.find(p => p.id === i.productId)!
      })).filter(i => i.product);
      
      combined.sort((a, b) => {
        const nameCompare = a.product.name.localeCompare(b.product.name);
        if (nameCompare !== 0) return nameCompare;
        
        const romA = parseInt(a.product.rom || '0');
        const romB = parseInt(b.product.rom || '0');
        if (romA !== romB) return romA - romB;
        
        const ramA = parseInt(a.product.ram || '0');
        const ramB = parseInt(b.product.ram || '0');
        return ramA - ramB;
      });
      
      setInventory(combined);
    } else if (activeTab === 'clientes') {
      const allClients = await db.clients.toArray();
      allClients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
      setClients(allClients);
    } else if (activeTab === 'produtos') {
      const allProducts = await db.products.toArray();
      
      allProducts.sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        
        const romA = parseInt(a.rom || '0');
        const romB = parseInt(b.rom || '0');
        if (romA !== romB) return romA - romB;
        
        const ramA = parseInt(a.ram || '0');
        const ramB = parseInt(b.ram || '0');
        return ramA - ramB;
      });
      
      setProducts(allProducts);
    } else if (activeTab === 'historico') {
      setSales(await db.sales.orderBy('date').reverse().toArray());
    }
  };

  const handleDeleteProduct = async () => {
    if (productToDelete?.id) {
      // Delete inventory associated with this product
      const inv = await db.inventory.where('productId').equals(productToDelete.id).first();
      if (inv?.id) {
        await db.inventory.delete(inv.id);
      }
      // Delete the product
      await db.products.delete(productToDelete.id);
      setShowProductDeleteConfirm(false);
      setProductToDelete(null);
      loadData();
    }
  };

  const handleCancelSale = async (sale: Sale) => {
    if (window.confirm('Deseja cancelar esta venda e estornar o estoque?')) {
      // Estornar estoque
      for (const item of sale.items) {
        const inv = await db.inventory.where('productId').equals(item.productId).first();
        if (inv) {
          await db.inventory.update(inv.id!, { quantity: inv.quantity + 1 });
        }
      }
      // Atualizar status da venda
      await db.sales.update(sale.id!, { status: 'cancelled' });
      loadData();
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) return;
    
    const combinedAddress = [
      newClient.street,
      newClient.city,
      newClient.state,
      newClient.zipCode
    ].filter(Boolean).join(' - ');
    
    const clientToSave = { ...newClient, address: combinedAddress || newClient.address };
    
    if (editingClient?.id) {
      await db.clients.update(editingClient.id, clientToSave);
    } else {
      await db.clients.add(clientToSave);
    }
    
    setShowClientModal(false);
    setEditingClient(null);
    setNewClient({ name: '', phone: '', address: '', street: '', city: '', state: '', zipCode: '', cnpj: '' });
    loadData();
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setNewClient({ 
      name: client.name, 
      phone: client.phone, 
      address: client.address || '', 
      street: client.street || '',
      city: client.city || '',
      state: client.state || '',
      zipCode: client.zipCode || '',
      cnpj: client.cnpj 
    });
    setShowClientModal(true);
  };

  const handleDeleteClient = async () => {
    if (clientToDelete?.id) {
      await db.clients.delete(clientToDelete.id);
      setShowDeleteConfirm(false);
      setClientToDelete(null);
      loadData();
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.brand || !newProduct.model) return;
    
    const combinedGb = [
      (newProduct.ram && newProduct.rom) ? `${newProduct.ram}/${newProduct.rom}GB` : (newProduct.ram ? `${newProduct.ram}GB RAM` : (newProduct.rom ? `${newProduct.rom}GB ROM` : '')),
      newProduct.network ? `${newProduct.network}` : '',
      newProduct.nfc === 'Sim' ? 'NFC' : ''
    ].filter(Boolean).join(' | ');
    
    const productToSave = { 
      brand: newProduct.brand,
      model: newProduct.model,
      name: `${newProduct.brand} ${newProduct.model}`, 
      gb: combinedGb || newProduct.gb,
      rom: newProduct.rom,
      ram: newProduct.ram,
      network: newProduct.network,
      nfc: newProduct.nfc,
      active: true
    };
    
    if (editingProduct?.id) {
      await db.products.update(editingProduct.id, productToSave);
      const inv = await db.inventory.where('productId').equals(editingProduct.id).first();
      if (inv) {
        await db.inventory.update(inv.id!, { quantity: Number(newProduct.quantity) || 0 });
      } else {
        await db.inventory.add({ productId: editingProduct.id, quantity: Number(newProduct.quantity) || 0 });
      }
    } else {
      const productId = await db.products.add({ ...productToSave, active: true });
      await db.inventory.add({ productId, quantity: Number(newProduct.quantity) || 0 });
    }
    
    setShowProductModal(false);
    setEditingProduct(null);
    setNewProduct({ brand: '', model: '', name: '', gb: '', rom: '', ram: '', color: '', quantity: 0 });
    loadData();
  };

  const handleEditProduct = async (product: Product) => {
    const inv = await db.inventory.where('productId').equals(product.id!).first();
    setEditingProduct(product);
    setNewProduct({ 
      brand: product.brand || '',
      model: product.model || product.name,
      name: product.name, 
      gb: product.gb,
      rom: product.rom || '',
      ram: product.ram || '',
      network: product.network || '',
      nfc: product.nfc || '',
      quantity: inv ? inv.quantity : 0
    });
    setShowProductModal(true);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'estoque':
        return (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-4 sticky top-0 z-10 border border-gray-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar no estoque..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 text-base"
                />
              </div>
            </div>
            <div className="space-y-3">
              {inventory
                .filter(i => i.product.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((item) => (
                <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm flex justify-between items-center border border-gray-100">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">{item.product.name}</h3>
                    <p className="text-sm text-gray-500 font-medium">{item.product.gb}</p>
                  </div>
                  <div className="text-right bg-emerald-50 px-4 py-2 rounded-2xl">
                    <span className="text-3xl font-black text-emerald-600">{item.quantity}</span>
                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">unid</p>
                  </div>
                </div>
              ))}
              {inventory.length === 0 && (
                <div className="text-center text-gray-500 py-10">Nenhum produto no estoque. Adicione via Chat!</div>
              )}
            </div>
          </div>
        );
      case 'clientes':
        return (
          <div className="space-y-3">
            <button 
              onClick={() => setShowClientModal(true)}
              className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-200 active:scale-95 transition-transform"
            >
              <Plus className="w-7 h-7" />
              <span>Novo Cliente</span>
            </button>
            {clients.map(client => (
              <div key={client.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-800">{client.name}</h3>
                  <p className="text-sm text-gray-500">{client.phone}</p>
                  <p className="text-xs text-gray-400 mt-1">{client.cnpj}</p>
                </div>
                <div className="flex space-x-1">
                  <button onClick={() => handleEditClient(client)} className="p-3 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors">
                    <Pencil className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => {
                      setClientToDelete(client);
                      setShowDeleteConfirm(true);
                    }} 
                    className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      case 'produtos':
        return (
          <div className="space-y-3">
            <button 
              onClick={() => setShowProductModal(true)}
              className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-xl shadow-emerald-200 active:scale-95 transition-transform"
            >
              <Plus className="w-7 h-7" />
              <span>Novo Produto</span>
            </button>
            {products.map(product => (
              <div key={product.id} className={cn("bg-white p-4 rounded-xl shadow-sm flex justify-between items-center", !product.active && "opacity-50")}>
                <div>
                  <h3 className="font-semibold text-gray-800">{product.name}</h3>
                  <p className="text-xs text-gray-500">{product.gb}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => handleEditProduct(product)} className="p-3 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors">
                    <Pencil className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => {
                      setProductToDelete(product);
                      setShowProductDeleteConfirm(true);
                    }} 
                    className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      case 'historico':
        return (
          <div className="space-y-3">
            {sales.map(sale => (
              <div key={sale.id} className={cn("bg-white p-4 rounded-xl shadow-sm", sale.status === 'cancelled' && "opacity-60")}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">Venda #{sale.id}</h3>
                    <p className="text-xs text-gray-500">{new Date(sale.date).toLocaleDateString()} às {new Date(sale.date).toLocaleTimeString()}</p>
                  </div>
                  <span className="font-bold text-emerald-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.total)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 mb-3">
                  {sale.items.length} itens vendidos
                </div>
                <div className="flex gap-2">
                  {sale.pdfBase64 && (
                    <button 
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = sale.pdfBase64!;
                        link.download = `Romaneio_Venda_${sale.id}.pdf`;
                        link.click();
                      }}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:bg-gray-200 transition-colors"
                    >
                      <FileText className="w-5 h-5" />
                      <span>Ver PDF</span>
                    </button>
                  )}
                  {sale.status === 'completed' && (
                    <button 
                      onClick={() => handleCancelSale(sale)}
                      className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:bg-red-100 transition-colors"
                    >
                      <RotateCcw className="w-5 h-5" />
                      <span>Estornar</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sales.length === 0 && (
              <div className="text-center text-gray-500 py-10">Nenhuma venda registrada ainda.</div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-200 pt-safe">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Painel</h1>
          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
            <Settings className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex w-full px-2 pb-4 gap-1">
          {[
            { id: 'estoque', icon: Package, label: 'Estoque' },
            { id: 'clientes', icon: Users, label: 'Clientes' },
            { id: 'produtos', icon: Settings, label: 'Produtos' },
            { id: 'historico', icon: FileText, label: 'Histórico' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={cn(
                "flex-1 flex flex-col sm:flex-row items-center justify-center space-y-0.5 sm:space-y-0 sm:space-x-2 px-0 py-2 rounded-xl whitespace-nowrap text-[9px] min-[360px]:text-[10px] sm:text-sm font-bold transition-all active:scale-95",
                activeTab === tab.id 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100" 
                  : "bg-white text-gray-500 border border-gray-200"
              )}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="p-4">
        {renderContent()}
      </main>

      {/* Modal Novo/Editar Cliente */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 shadow-xl animate-in slide-in-from-bottom duration-300 sm:m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => { setShowClientModal(false); setEditingClient(null); }} className="p-2 text-gray-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveClient} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Nome *</label>
                <input required type="text" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="Nome do cliente" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Telefone / WhatsApp</label>
                <input type="tel" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">CNPJ / CPF</label>
                <input type="text" value={newClient.cnpj} onChange={e => setNewClient({...newClient, cnpj: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="00.000.000/0001-00" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rua, Número e Bairro</label>
                <input type="text" value={newClient.street} onChange={e => setNewClient({...newClient, street: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="Ex: Rua das Flores, 123, Centro" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Cidade</label>
                  <input type="text" value={newClient.city} onChange={e => setNewClient({...newClient, city: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="Ex: São Paulo" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Estado</label>
                  <select value={newClient.state} onChange={e => setNewClient({...newClient, state: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none">
                    <option value="">Selecione...</option>
                    <option value="AC">Acre</option>
                    <option value="AL">Alagoas</option>
                    <option value="AP">Amapá</option>
                    <option value="AM">Amazonas</option>
                    <option value="BA">Bahia</option>
                    <option value="CE">Ceará</option>
                    <option value="DF">Distrito Federal</option>
                    <option value="ES">Espírito Santo</option>
                    <option value="GO">Goiás</option>
                    <option value="MA">Maranhão</option>
                    <option value="MT">Mato Grosso</option>
                    <option value="MS">Mato Grosso do Sul</option>
                    <option value="MG">Minas Gerais</option>
                    <option value="PA">Pará</option>
                    <option value="PB">Paraíba</option>
                    <option value="PR">Paraná</option>
                    <option value="PE">Pernambuco</option>
                    <option value="PI">Piauí</option>
                    <option value="RJ">Rio de Janeiro</option>
                    <option value="RN">Rio Grande do Norte</option>
                    <option value="RS">Rio Grande do Sul</option>
                    <option value="RO">Rondônia</option>
                    <option value="RR">Roraima</option>
                    <option value="SC">Santa Catarina</option>
                    <option value="SP">São Paulo</option>
                    <option value="SE">Sergipe</option>
                    <option value="TO">Tocantins</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">CEP</label>
                <input type="text" value={newClient.zipCode} onChange={e => setNewClient({...newClient, zipCode: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="00000-000" />
              </div>
              <div className="flex space-x-3 pt-4 pb-safe">
                <button type="button" onClick={() => { setShowClientModal(false); setEditingClient(null); setNewClient({ name: '', phone: '', address: '', street: '', city: '', state: '', zipCode: '', cnpj: '' }); }} className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo/Editar Produto */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 shadow-xl animate-in slide-in-from-bottom duration-300 sm:m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={() => { setShowProductModal(false); setEditingProduct(null); }} className="p-2 text-gray-400">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Nome (Marca) *</label>
                <select required value={newProduct.brand} onChange={e => setNewProduct({...newProduct, brand: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none">
                  <option value="">Selecione a marca...</option>
                  <option value="Motorola">Motorola</option>
                  <option value="Realme">Realme</option>
                  <option value="Redmi">Redmi</option>
                  <option value="Poco">Poco</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Modelo *</label>
                <input required type="text" value={newProduct.model} onChange={e => setNewProduct({...newProduct, model: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="Ex: iPhone 13" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">RAM (Memória)</label>
                <select value={newProduct.ram} onChange={e => setNewProduct({...newProduct, ram: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none">
                  <option value="">Selecione...</option>
                  <option value="4">4</option>
                  <option value="6">6</option>
                  <option value="8">8</option>
                  <option value="12">12</option>
                  <option value="16">16</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">ROM (Armazenamento)</label>
                <select value={newProduct.rom} onChange={e => setNewProduct({...newProduct, rom: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none">
                  <option value="">Selecione...</option>
                  <option value="128">128</option>
                  <option value="256">256</option>
                  <option value="512">512</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Rede</label>
                <select value={newProduct.network} onChange={e => setNewProduct({...newProduct, network: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none">
                  <option value="">Selecione...</option>
                  <option value="4G">4G</option>
                  <option value="5G">5G</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">NFC</label>
                <select value={newProduct.nfc} onChange={e => setNewProduct({...newProduct, nfc: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base appearance-none">
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Quantidade em Estoque</label>
                <input type="number" min="0" value={newProduct.quantity} onChange={e => setNewProduct({...newProduct, quantity: e.target.value ? parseInt(e.target.value) : ''})} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none text-base" placeholder="Ex: 10" />
              </div>
              <div className="flex space-x-3 pt-4 pb-safe">
                <button type="button" onClick={() => { setShowProductModal(false); setEditingProduct(null); setNewProduct({ brand: '', model: '', name: '', gb: '', rom: '', ram: '', network: '', nfc: '', quantity: 0 }); }} className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-200">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in duration-200">
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mb-4 mx-auto">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-2">Excluir Cliente?</h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Tem certeza que deseja excluir o cliente <span className="font-bold text-gray-700">{clientToDelete?.name}</span>? Esta ação não pode ser desfeita.
            </p>
            <div className="flex space-x-3">
              <button 
                onClick={() => { setShowDeleteConfirm(false); setClientToDelete(null); }} 
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteClient} 
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-100 active:scale-95 transition-transform"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação de Exclusão de Produto */}
      {showProductDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in duration-200">
            <div className="flex items-center justify-center w-12 h-12 bg-red-50 rounded-full mb-4 mx-auto">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center mb-2">Excluir Produto?</h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              Tem certeza que deseja excluir o produto <span className="font-bold text-gray-700">{productToDelete?.name}</span>? Esta ação removerá o item do estoque e do catálogo permanentemente.
            </p>
            <div className="flex space-x-3">
              <button 
                onClick={() => { setShowProductDeleteConfirm(false); setProductToDelete(null); }} 
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteProduct} 
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-100 active:scale-95 transition-transform"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
