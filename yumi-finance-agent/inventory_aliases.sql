-- Upgrade aliases for pos.inventory — comprehensive supplier shorthand mapping
-- Langkah 1: Update existing aliases with more useful abbreviations

-- ===== BAR category =====
UPDATE pos.inventory
SET aliases = ARRAY['Freshmilk GF', 'FM GF', 'FM Greenfield', 'Freshmilk Greenfield']
WHERE ingredient_name = 'Freshmilk Greenfield'
  AND aliases IS NOT DISTINCT FROM ARRAY['Freshmilk Greenfield'];

UPDATE pos.inventory
SET aliases = ARRAY['SG Apple', 'Seng Guan Heng Apple']
WHERE ingredient_name = 'Apple Juice'
  AND aliases @> ARRAY['Apple Juice (Jungle Juice)'];

UPDATE pos.inventory
SET aliases = ARRAY['Beans Arabika', 'Arabika Flores Bajawa', 'Flores Bajawa FW', 'BAFBF', 'Arabika FW']
WHERE ingredient_name = 'Beans Arabika Flores Bajawa FW';

UPDATE pos.inventory
SET aliases = ARRAY['Beans Robusta', 'BR', 'Robusta Beans', 'Robusta']
WHERE ingredient_name = 'Robusta Beans';

UPDATE pos.inventory
SET aliases = ARRAY['Lem', 'Le Minerale']
WHERE ingredient_name = 'Le Mineral';

UPDATE pos.inventory
SET aliases = ARRAY['Coco Delight', 'Frisian Flag Coco', 'FF Coconut', 'FF Coco']
WHERE ingredient_name = 'Frisianflag Coconut Delight';

UPDATE pos.inventory
SET aliases = ARRAY['Schweppes']
WHERE ingredient_name = 'Schweppes Soda';

UPDATE pos.inventory
SET aliases = ARRAY['Soda Schweppes', 'SW Soda']
WHERE ingredient_name = 'Soda Water Schweppes';

UPDATE pos.inventory
SET aliases = ARRAY['Lemon Max Tea', 'Max Tea Lemon', 'Lemon Tea MT']
WHERE ingredient_name = 'Lemon Tea Max Tea';

UPDATE pos.inventory
SET aliases = ARRAY['Peach Max Tea', 'Max Tea Peach', 'Peach Tea MT']
WHERE ingredient_name = 'Peach Tea Max Tea';

UPDATE pos.inventory
SET aliases = ARRAY['SKM Carnation', 'Susu Carnation']
WHERE ingredient_name = 'SKM Carnation';

UPDATE pos.inventory
SET aliases = ARRAY['Cleo']
WHERE ingredient_name = 'Cleo';

UPDATE pos.inventory
SET aliases = ARRAY['Pulpy', 'Pulpy Tofico']
WHERE ingredient_name = 'Pulpy Orange';

UPDATE pos.inventory
SET aliases = ARRAY['Sunquick']
WHERE ingredient_name = 'Sunquick Lemon';

UPDATE pos.inventory
SET aliases = ARRAY['Susu Frisian Flag Coco', 'Frisian Flag Coconut']
WHERE ingredient_name = 'Susu Coconut';

UPDATE pos.inventory
SET aliases = ARRAY['Single Mango', 'Mango Minotour']
WHERE ingredient_name = 'Single Origin Mango';

UPDATE pos.inventory
SET aliases = ARRAY['Single Strawberry', 'Strawberry Minotour']
WHERE ingredient_name = 'Single Origin Strawberry';

-- ===== kitchen category =====
UPDATE pos.inventory
SET aliases = ARRAY['Bawang Putih', 'Bawang Putih Bu Dian']
WHERE ingredient_name = 'Bawang Putih';

UPDATE pos.inventory
SET aliases = ARRAY['Bawang Daun', 'BD']
WHERE ingredient_name = 'Bawang Daun';

UPDATE pos.inventory
SET aliases = ARRAY['Paha Ayam Filet', 'Paha Filet Ibu']
WHERE ingredient_name = 'Paha Filet';

UPDATE pos.inventory
SET aliases = ARRAY['Idaho Shoestring', 'Shoestring Kentang']
WHERE ingredient_name = 'Kentang Shoestring';

UPDATE pos.inventory
SET aliases = ARRAY['French Fries', 'FF Shoestring']
WHERE ingredient_name = 'French Fries Shoestring 2,5 Kg';

UPDATE pos.inventory
SET aliases = ARRAY['Sosis Bernardi', 'Bernardi Sosis', 'Sosis Horeca']
WHERE ingredient_name = 'Bernardi Horeca Sosis';

UPDATE pos.inventory
SET aliases = ARRAY['Bubuk Coklat', 'Coklat Denali', 'Choco Powder']
WHERE ingredient_name = 'Coklat Powder';

UPDATE pos.inventory
SET aliases = ARRAY['Gold Label Cream', 'Cream Gold', 'Gold Label']
WHERE ingredient_name = 'Cream';

UPDATE pos.inventory
SET aliases = ARRAY['Saus Tiram Mahsuri', 'Saus Tiram']
WHERE ingredient_name = 'Saus Tiram (Mahsuri)';

UPDATE pos.inventory
SET aliases = ARRAY['Saus Mustard Maestro', 'Saus Mustard']
WHERE ingredient_name = 'Saus Mustard (Maestro)';

UPDATE pos.inventory
SET aliases = ARRAY['Saus Inggris', 'Worcester Sauce']
WHERE ingredient_name = 'Saus Inggris 620ML';

UPDATE pos.inventory
SET aliases = ARRAY['Barbeque']
WHERE ingredient_name = 'Barbeque Sauce';

UPDATE pos.inventory
SET aliases = ARRAY['Minyak Wijen Ogh', 'Minyak Wijen']
WHERE ingredient_name = 'Minyak Wijen';

UPDATE pos.inventory
SET aliases = ARRAY['Margarin Filma', 'Filma Margarine', 'Filma']
WHERE ingredient_name = 'Margarine (Filma)';

UPDATE pos.inventory
SET aliases = ARRAY['Koepoe Garlic', 'Garlic Koepoe']
WHERE ingredient_name = 'Garlic Powder (Koepoe)';

UPDATE pos.inventory
SET aliases = ARRAY['Gula Pasir', 'GPP', 'Gula Asta']
WHERE ingredient_name = 'Gula Pasir Putih';

UPDATE pos.inventory
SET aliases = ARRAY['Bikin Yamin Warman', 'Yamin Warman']
WHERE ingredient_name = 'Bikin Yamin';

UPDATE pos.inventory
SET aliases = ARRAY['Yamin Base Warman']
WHERE ingredient_name = 'Yamin Base';

UPDATE pos.inventory
SET aliases = ARRAY['Biji Wijen Asta', 'Wijen Asta']
WHERE ingredient_name = 'Biji Wijen';

UPDATE pos.inventory
SET aliases = ARRAY['Minyak Rizki']
WHERE ingredient_name = 'Minyak Rizki';

UPDATE pos.inventory
SET aliases = ARRAY['Minyak Sunco', 'Sunco']
WHERE ingredient_name = 'Minyak Sunco';

UPDATE pos.inventory
SET aliases = ARRAY['Minyak Tropical', 'Tropical 1L']
WHERE ingredient_name = 'Minyak Tropical 1L';

UPDATE pos.inventory
SET aliases = ARRAY['Sosis Salam', 'Sosis Horeca Salam']
WHERE ingredient_name = 'Sosis (Salam)';

UPDATE pos.inventory
SET aliases = ARRAY['Ubi Cilembu Heri', 'Cilembu']
WHERE ingredient_name = 'Ubi Cilembu';

UPDATE pos.inventory
SET aliases = ARRAY['Happy Egg', 'Telor Omega Happy Egg']
WHERE ingredient_name = 'Telor Omega (Happy Egg)';

UPDATE pos.inventory
SET aliases = ARRAY['Palm Sugar Haan', 'Haan Palm']
WHERE ingredient_name = 'Palm Sugar';

UPDATE pos.inventory
SET aliases = ARRAY['Richgold', 'Rich Gold']
WHERE ingredient_name = 'Richgold Label';

UPDATE pos.inventory
SET aliases = ARRAY['Cabe Keriting', 'Cabe Merah Keriting']
WHERE ingredient_name = 'Cabe Keriting Merah';

UPDATE pos.inventory
SET aliases = ARRAY['Oyster LKK', 'Oyster Lee Kum Kee']
WHERE ingredient_name = 'Oyster Sauce (Lee Kum Kee)';

UPDATE pos.inventory
SET aliases = ARRAY['Hoisin LKK', 'Hoisin Lee Kum Kee']
WHERE ingredient_name = 'Hoisin Sauce';

UPDATE pos.inventory
SET aliases = ARRAY['Daging Ayam', 'Ayam (daging)']
WHERE ingredient_name = 'Daging Ayam';

UPDATE pos.inventory
SET aliases = ARRAY['Cabe Domba Bu Dian']
WHERE ingredient_name = 'Cabe Domba';

UPDATE pos.inventory
SET aliases = ARRAY['Bumbu Kunci Mas', 'Kunci Mas']
WHERE ingredient_name = 'Bumbu Kunci Mas';

-- ===== OTHER items without existing aliases - add acronyms =====
UPDATE pos.inventory SET aliases = ARRAY['Es Batu T-ICE', 'T-ICE'] WHERE ingredient_name = 'Es Batu' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Cabe Rawit Bu Dian', 'Rawit'] WHERE ingredient_name = 'Cabe Rawit' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Bawang Merah Bu Dian', 'Merah'] WHERE ingredient_name = 'Bawang Merah' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Bawang Bombai', 'Bombai'] WHERE ingredient_name = 'Bawang Bombai' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Gula Aren Bu Dian'] WHERE ingredient_name = 'Gula Aren' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Micin Sasa', 'Sasa'] WHERE ingredient_name = 'Micin' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Tepung Terigu Bu Dian', 'Terigu'] WHERE ingredient_name = 'Tepung Terigu' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kaldu Jamur Totole', 'Totole'] WHERE ingredient_name = 'Kaldu Jamur' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Selada Ibu Teti'] WHERE ingredient_name = 'Selada (Ibu Teti Pasar)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Timun Ibu Teti'] WHERE ingredient_name = 'Timun' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Beras Bu Dian'] WHERE ingredient_name = 'Beras' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Bakso Bu Dian'] WHERE ingredient_name = 'Bakso' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Ayam Giling Kedai Mamaina', 'Giling Ayam'] WHERE ingredient_name = 'Ayam Giling' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Sapi Cincang UT', 'Cincang Sapi'] WHERE ingredient_name = 'Sapi Cincang' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kecap Manis Bango', 'Bango'] WHERE ingredient_name = 'Kecap Manis' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Lada Bubuk Ladaku', 'Ladaku'] WHERE ingredient_name = 'Lada Bubuk' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Ayam Cincang Bu Dian'] WHERE ingredient_name = 'Ayam Cincang' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Keju Cheddar Kraft'] WHERE ingredient_name = 'Keju Cheddar Kraft 170g' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Keju Mozarella', 'Mozarella'] WHERE ingredient_name = 'Keju Mozarella 250g' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Matcha Denali', 'Denali Matcha'] WHERE ingredient_name = 'Matcha Powder' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Minyak Goreng Rizki'] WHERE ingredient_name = 'Minyak Goreng' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Dark Soy LKK', 'Kecap Hitam LKK'] WHERE ingredient_name = 'Dark Soy Sauce' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kecap Ikan SGH', 'Seng Guan Heng'] WHERE ingredient_name = 'Kecap Ikan' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Basil Yoa', 'Daun Basil'] WHERE ingredient_name = 'Basil' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Basil Leaves Yoa'] WHERE ingredient_name = 'Basil Leaves' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Oregano Yoa'] WHERE ingredient_name = 'Oregano' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Rosemary Yoa'] WHERE ingredient_name = 'Rosemary' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Paprika Jay'] WHERE ingredient_name = 'Paprika Powder' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Vanili Koepoe', 'Vanilla Koepoe'] WHERE ingredient_name = 'Vanili Bubuk (Koepoe)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Pasta Vanilla Koepoe', 'Vanilla Pasta'] WHERE ingredient_name = 'Pasta Perisa Vanilla' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Paha Filet Ibu Daging'] WHERE ingredient_name = 'Paha Filet' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Mix Veg Golden Farm'] WHERE ingredient_name = 'Mix Vegetable' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Bawang Putih Bubuk Yoa'] WHERE ingredient_name = 'Bawang Putih Bubuk (YOA)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Telur Ayam (kg)', 'Telur Ayam Negeri'] WHERE ingredient_name = 'Telur Ayam' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Cabe Kering Sedap Wangi'] WHERE ingredient_name = 'Cabe Kering' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Garam Kapal', 'Kapal'] WHERE ingredient_name = 'Garam' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Ngohion Yoa'] WHERE ingredient_name = 'Ngohion' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Merica Ladaku'] WHERE ingredient_name = 'Merica' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kemangi Instant Bu Dian'] WHERE ingredient_name = 'Kemangi Instant' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Lada Hitam Yoa'] WHERE ingredient_name = 'Lada Hitam Bubuk' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kecap Asin ABC', 'Kecap Asin'] WHERE ingredient_name = 'Kecap Asin ABC' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kamper Pedas Yoa'] WHERE ingredient_name = 'Kamper Pedas (YOA)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kulit Pangsit Jempol'] WHERE ingredient_name = 'Kulit Pangsit (Cap Jempol)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Tongcai Tunggal Jaya'] WHERE ingredient_name = 'Tongcai' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Roti Tawar', 'Roti Gandum'] WHERE ingredient_name = 'Roti Tawar Gandum' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Nasi Goreng Sauce Warman'] WHERE ingredient_name = 'Nasi Goreng Sauce' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Nasi Chasiu Warman'] WHERE ingredient_name = 'Nasi Ayam Chasiu Sauce' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Nasi Mentega Warman'] WHERE ingredient_name = 'Nasi Ayam Mentega Sauce' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Nasi Rempah Warman'] WHERE ingredient_name = 'Nasi Ayam Rempah Kemangi Sauce' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Nasi Telor Pontianak Warman'] WHERE ingredient_name = 'Nasi Telor Omega Pontianak Sauce' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Butter Orchid', 'Orchid Butter'] WHERE ingredient_name = 'Butter' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Mayonaise Maestro', 'Mayo Maestro'] WHERE ingredient_name = 'Mayonaise' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Saus Tomat Del Monte'] WHERE ingredient_name = 'Saus Tomat (Del Monte)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Saus Sambal Del Monte'] WHERE ingredient_name = 'Saus Sambel (Del Monte)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kecap Manis Bango Pouch'] WHERE ingredient_name = 'Kecap Manis' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Roti Bread Co'] WHERE ingredient_name = 'Roti (Bread Co)' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Daging Ayam', 'Ayam Fillet'] WHERE ingredient_name = 'Daging Ayam' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Tulang Ibu Teti'] WHERE ingredient_name = 'Tulang' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kulit Ayam Ibu Teti'] WHERE ingredient_name = 'Kulit Ayam' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Sereh Ibu Teti'] WHERE ingredient_name = 'Sereh' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kemiri Ibu Teti'] WHERE ingredient_name = 'Kemiri' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kayu Manis'] WHERE ingredient_name = 'Kayu Manis' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Jeruk Limau Bu Dian', 'Limau'] WHERE ingredient_name = 'Jeruk Limau' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Ebi Bu Dian'] WHERE ingredient_name = 'Ebi (500gr)' AND aliases IS NULL;

-- packaging
UPDATE pos.inventory SET aliases = ARRAY['Cup 12', 'PET Cup 12'] WHERE ingredient_name = 'Cup 12 PET' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Paperbowl', 'Paper Bowl 650', 'Mangkok Kertas 650'] WHERE ingredient_name = 'Paperbowl 650ml' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Bento Tupai', 'Bento 4 Sekat'] WHERE ingredient_name = 'Bento Tupai 4 Sekat' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kresek 28', 'Kresek Putih 28'] WHERE ingredient_name = 'Kresek Piala Uk 28 Putih' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Kresek Cup', 'Kresek 1 Cup'] WHERE ingredient_name = 'Kresek Piala 1 Cup' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Botol 1L', 'Botol 1000ml'] WHERE ingredient_name = 'Botol 1 Liter' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Sendok Garpu Plastik'] WHERE ingredient_name = 'Sendok Garpu' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Cling Wrap', 'Plastik Cling'] WHERE ingredient_name = 'Cling' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Tutup Cup'] WHERE ingredient_name = 'Tutup Cup' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Sedotan Hitam', 'Sedotan Tekuk'] WHERE ingredient_name = 'Sedotan Steril Tekuk Hitam' AND aliases IS NULL;

-- cleaning
UPDATE pos.inventory SET aliases = ARRAY['Soklin'] WHERE ingredient_name = 'Soklin Lantai' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Multi Tisu Yoa', 'Tisu Multi'] WHERE ingredient_name = 'Multi Tisu' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Ekonomi', 'Pencuci Piring Ekonomi'] WHERE ingredient_name = 'Ekonomi Pencuci Piring' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Lifebuoy'] WHERE ingredient_name = 'Lifebuoy Pencuci Piring' AND aliases IS NULL;

-- other
UPDATE pos.inventory SET aliases = ARRAY['Baterai'] WHERE ingredient_name = 'Baterai ABC' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Gas 3Kg', 'Gas Melon'] WHERE ingredient_name = 'Gas 3 Kg' AND aliases IS NULL;

UPDATE pos.inventory SET aliases = ARRAY['Galon Cleo', 'Air Galon Cleo'] WHERE ingredient_name = 'Air Galon' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Air Mineral Le Minerale', 'Le Minerale Air'] WHERE ingredient_name = 'Air Mineral' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Big Cola'] WHERE ingredient_name = 'Big Cola' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['C1000'] WHERE ingredient_name = 'C1000 Apple' AND aliases IS NULL;
UPDATE pos.inventory SET aliases = ARRAY['Sprite'] WHERE ingredient_name = 'Sprite' AND aliases IS NULL;
