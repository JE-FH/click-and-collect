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

--user for "Northern Ecommerce" password is "fJohnson12"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("fionajohnson", "0446fc5b9f68789d2bf25f158b5c50e9ecca1476a093a2c59c88d834dc3d2c460fb0149491bcb42e1e5b0a1b6663972d52ca0a868adedbb2e284e95e3463629b", "9c7741fb8440d978977f2a691ed52236", "Fiona Johnson", 0, 1);

--package for Ole in Northern Ecommerce
--email link is http://www.fakemailgenerator.com/#/gustr.com/fakeole123/
--package link is https://clickandcollect.papzi.xyz/package?guid=f9310faac07edc0c
INSERT INTO package (guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate, readyState, remindersSent) VALUES 
    ("f9310faac07edc0c", 1, NULL, "J28UN9DT", "fakeole123@gustr.com", "Ole", "#94729521", "2021-05-24T12:11:16", 1, 0);

--package for Peter in Northern Ecommerce
--email link is http://www.fakemailgenerator.com/#/gustr.com/fakepeter123/
--package link is https://clickandcollect.papzi.xyz/package?guid=33d5e15ca6c352bd
INSERT INTO package (guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate, readyState, remindersSent) VALUES 
    ("33d5e15ca6c352bd", 1, NULL, "0JF1CYSP", "fakepeter123@gustr.com", "Peter", "#66213490", "2021-05-24T12:11:44", 1, 0);

--package for Bo in Northern Ecommerce
--email link is http://www.fakemailgenerator.com/#/gustr.com/fakebo123/
--package link is https://clickandcollect.papzi.xyz/package?guid=e877b2ab6c018703
INSERT INTO package (guid, storeId, bookedTimeId, verificationCode, customerEmail, customerName, externalOrderId, creationDate, readyState, remindersSent) VALUES 
    ("e877b2ab6c018703", 1, NULL, "OS7SGYVR", "fakebo123@gustr.com", "Bo", "#84259622", "2021-05-24T12:12:04", 1, 0);

--superuser for "Southern Ecommerce" password is "adminEast1"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("amandaeast", "cf4858d2f1f289fd6fd11c700b2a11a96a16cd5391872bb1601302a1d5996adabad140b74b5801b08eda4f7f2aab2e1ad8a9db7cb6b4c8c817ed6c9a727964d9", "58d1f9336c6f8a9a26b2722d6b0a7fca", "Amanda E. Boyer", 1, 2);

--user for "Southern Ecommerce" password is "mBagger13"
INSERT INTO user (username, password, salt, name, superuser, storeId) VALUES
	("michaelbagger", "3b37e26ed27d78d32cf52e3a101563d1088fbb90345e8635f583f049d6b05f6698cca481016ca78912cb2bbe2940bebf6c58523cda0e2e142e5cab06cad87d0a", "ae9f0af367a22637f6c13bfc39e2614a", "Michael Bagger", 0, 2);

INSERT INTO `queue` (latitude, longitude, size, storeId, queueName) VALUES
	(57.7279214148815,10.5834288717925, 1, 1, "Indgang Vest"),
	(57.7275846865472,10.584194839484, 1, 1, "Indgang Øst");