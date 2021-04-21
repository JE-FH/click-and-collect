
CREATE TABLE IF NOT EXISTS store (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name varchar NOT NULL,
	openingTime text NOT NULL,
	pickupDelay time NOT NULL,
	apiKey varchar NOT NULL,
	storeEmail varchar NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_store_apiKey on store (apiKey);

CREATE TABLE IF NOT EXISTS user (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	username varchar NOT NULL,
	password varchar NOT NULL,
	salt varchar NOT NULL,
	name varchar NOT NULL,
	superuser blob NOT NULL,
	storeId integer NOT NULL,
	FOREIGN KEY (storeId)
		REFERENCES store (id)
);

CREATE INDEX IF NOT EXISTS idx_user_storeId ON user (storeId);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_username ON user (username);

CREATE TABLE IF NOT EXISTS queue (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	latitude float NOT NULL,
	longitude float NOT NULL,
	size integer NOT NULL,
	storeId integer NOT NULL,
	queueName varchar NOT NULL,
	FOREIGN KEY (storeId)
		REFERENCES store (id)
);

CREATE INDEX IF NOT EXISTS idx_queue_storeId ON queue (storeId);

CREATE TABLE IF NOT EXISTS timeSlot (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	storeId integer NOT NULL,
	startTime time NOT NULL,
	endTime time NOT NULL,
	queueId integer NOT NULL,
	FOREIGN KEY (queueId)
		REFERENCES queue (id),
	FOREIGN KEY (storeId)
		REFERENCES store (id)
);

CREATE INDEX IF NOT EXISTS idx_timeSlot_storeId ON timeSlot (storeId);

CREATE TABLE IF NOT EXISTS package (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	guid varchar NOT NULL,
	storeId integer NOT NULL,
	bookedTimeId integer,
	verificationCode varchar,
	customerEmail varchar NOT NULL,
	customerName varchar,
	externalOrderId integer,
	creationDate timestamp NOT NULL,
	delivered blob NOT NULL DEFAULT 0,
	remindersSent NOT NULL DEFAULT 0,
	FOREIGN KEY (bookedTimeId)
		REFERENCES queue (id),
	FOREIGN KEY (storeId)
		REFERENCES store (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_package_guid ON package (guid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_package_verificationCode ON package (verificationCode);
CREATE INDEX IF NOT EXISTS idx_package_creationDate ON package (creationDate);
CREATE INDEX IF NOT EXISTS idx_package_customerName ON package (customerName);
CREATE INDEX IF NOT EXISTS idx_package_externalOrderId ON package (externalOrderId);
CREATE INDEX IF NOT EXISTS idx_package_bookedTimeId ON package (bookedTimeId);
CREATE INDEX IF NOT EXISTS idx_package_storeId ON package (storeId);			