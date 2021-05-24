INSERT INTO store (id, name, openingTime, apiKey, storeEmail) VALUES
	(4563, "dkfaoef", 
'{"monday": ["08:00:00", "17:00:00"],' || 
'"tuesday": ["08:00:00", "17:00:00"],' ||
'"wednesday": ["08:00:00", "17:00:00"],' ||
'"thursday": ["08:00:00", "17:00:00"],' ||
'"friday": ["08:00:00", "17:00:00"],' ||
'"saturday": ["10:00:00", "12:30:00"],' ||
'"sunday": []}', 
"00:00:00", "ksokg", "dkfaoef@mail.com");

--demo web shop 1: "Northern Ecommerce"
INSERT INTO store (id, name, openingTime, apiKey, storeEmail) VALUES
	(1, "Northern Ecommerce", '{"monday": ["08:00:00", "17:00:00"],' || 
'"tuesday": ["08:00:00", "17:00:00"],' ||
'"wednesday": ["08:00:00", "17:00:00"],' ||
'"thursday": ["08:00:00", "17:00:00"],' ||
'"friday": ["08:00:00", "17:00:00"],' ||
'"saturday": ["08:00:00", "17:00:00"],' ||
'"sunday": ["08:00:00", "17:00:00"]}', "nothern-ecommerce-9483557717594177", "ne@northernecommerce.com");

--demo web shop 2: "Southern Ecommerce"
INSERT INTO store (id, name, openingTime, apiKey, storeEmail) VALUES
	(2, "Southern Ecommerce", '{"monday": ["08:00:00", "17:00:00"],' || 
'"tuesday": ["08:00:00", "17:00:00"],' ||
'"wednesday": ["08:00:00", "17:00:00"],' ||
'"thursday": ["08:00:00", "17:00:00"],' ||
'"friday": ["08:00:00", "17:00:00"],' ||
'"saturday": ["08:00:00", "17:00:00"],' ||
'"sunday": ["08:00:00", "17:00:00"]}', "southern-ecommerce-9137582955591253", "se@southnernecommerce.com");

--superuser for "Northern Ecommerce" password is "adminWest1"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("adamwest", "1cf332db1c4fdfac3e14d4eea0c59065eaea52bcc27b03667d2e35330ad581891e2aff0a322cd73beef9d17e4a9b63e4070715e921ef1887e40d72c2a5f2efc9", "15ca01f8e5ef0ee26fa243c5cc0beb2e", "Adam W. Eager", 1, 1);

--superuser for "Southern Ecommerce" password is "adminEast1"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("amandaeast", "cf4858d2f1f289fd6fd11c700b2a11a96a16cd5391872bb1601302a1d5996adabad140b74b5801b08eda4f7f2aab2e1ad8a9db7cb6b4c8c817ed6c9a727964d9", "58d1f9336c6f8a9a26b2722d6b0a7fca", "Amanda E. Boyer", 1, 2);

--password is "password"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("bob", "e7620ce600f3434e87dc9bfdaacdcf473f98f1275838f74f92c7e928da4a76a24d134576898ec1143f9603b025850f9e269af92d7e068f31dec31bb07c97cebc", "abcdefg", "bob", 0, 4563);

--password is "hunter2"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("superbob", "ecb71788886af823e32cd74d22a4fe2712cc579cd0783030ff75e54272191e3d3d9f4b4e156623119f8e2d2fa55cb84cc897a700171aec3ed7617a7602c80fa4", "akrogd", "bob", 1, 4563);

INSERT INTO queue (latitude, longitude, size, storeId, queueName) VALUES
	(57.7279214148815,10.5834288717925, size, 1, 1, "Indgang Vest"),
	(57.7275846865472,10.584194839484, size, 1, 1, "Indgang Øst");