import Dexie, { Table } from 'dexie';

export interface Product {
  id?: number;
  brand?: string;
  model?: string;
  name: string;
  gb: string;
  rom?: string;
  ram?: string;
  network?: string;
  nfc?: string;
  active: boolean;
}

export interface Inventory {
  id?: number;
  productId: number;
  quantity: number;
}

export interface Client {
  id?: number;
  name: string;
  phone: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  cnpj: string;
}

export interface SaleItem {
  productId: number;
  imei: string;
  price: number;
}

export interface Sale {
  id?: number;
  clientId: number;
  date: string;
  items: SaleItem[];
  total: number;
  pdfBase64?: string;
  status: 'completed' | 'cancelled';
}

export class AppDatabase extends Dexie {
  products!: Table<Product, number>;
  inventory!: Table<Inventory, number>;
  clients!: Table<Client, number>;
  sales!: Table<Sale, number>;

  constructor() {
    super('DistroAssistantDB');
    this.version(1).stores({
      products: '++id, name, gb, active',
      inventory: '++id, productId, quantity',
      clients: '++id, name, phone, cnpj',
      sales: '++id, clientId, date, status'
    });
  }
}

export const db = new AppDatabase();

// Seed initial data if empty
db.on('populate', async () => {
  const iphoneId = await db.products.add({ 
    brand: 'Apple',
    model: 'iPhone 13',
    name: 'Apple iPhone 13', 
    gb: '128GB', 
    ram: '4',
    rom: '128',
    network: '5G',
    nfc: 'Sim',
    active: true 
  });
  await db.inventory.add({ productId: iphoneId, quantity: 10 });
  
  const motoId = await db.products.add({ 
    brand: 'Motorola',
    model: 'Moto G54',
    name: 'Motorola Moto G54', 
    gb: '8/256GB', 
    ram: '8',
    rom: '256',
    network: '5G',
    nfc: 'Sim',
    active: true 
  });
  await db.inventory.add({ productId: motoId, quantity: 5 });

  const redmiId = await db.products.add({ 
    brand: 'Redmi',
    model: 'Note 13',
    name: 'Redmi Note 13', 
    gb: '6/128GB', 
    ram: '6',
    rom: '128',
    network: '4G',
    nfc: 'Não',
    active: true 
  });
  await db.inventory.add({ productId: redmiId, quantity: 8 });
  
  await db.clients.add({
    name: 'Cliente Exemplo',
    phone: '11999999999',
    address: 'Rua das Flores, 123',
    cnpj: '00.000.000/0001-00'
  });
});
