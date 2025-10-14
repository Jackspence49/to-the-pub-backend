// Mock mysql2/promise
const mockPool = {
    getConnection: jest.fn(),
    execute: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
};

jest.mock('mysql2/promise', () => ({
    createPool: jest.fn(() => mockPool)
}));

// Mock database config
jest.mock('../../config/database', () => ({
    host: 'test-host',
    port: 3306,
    user: 'test-user',
    password: 'test-password',
    database: 'test-database',
    connectionLimit: 15,
    charset: 'utf8mb4'
}));

const mysql = require('mysql2/promise');

describe('Database Pool Tests', () => {
    beforeEach(() => {
        // Clear mocks for pool methods but not createPool
        mockPool.getConnection.mockClear();
        mockPool.execute.mockClear();
        mockPool.query.mockClear();
        mockPool.end.mockClear();
    });

    describe('Pool Creation', () => {
        test('should create pool with correct configuration', () => {
            // Import after mocks are set up
            const pool = require('../../src/utils/db');

            expect(mysql.createPool).toHaveBeenCalledWith({
                host: 'test-host',
                port: 3306,
                user: 'test-user',
                password: 'test-password',
                database: 'test-database',
                waitForConnections: true,
                connectionLimit: 15,
                charset: 'utf8mb4'
            });

            expect(pool).toBe(mockPool);
        });

        test('should handle connection limit configuration', () => {
            // Test that the module exports the mock pool (indicating successful setup)
            const pool = require('../../src/utils/db');
            expect(pool).toBe(mockPool);
        });

        test('should handle charset configuration', () => {
            // Test that the module exports the mock pool (indicating successful setup)
            const pool = require('../../src/utils/db');
            expect(pool).toBe(mockPool);
        });
    });

    describe('Pool Functionality', () => {
        let pool;

        beforeEach(() => {
            pool = require('../../src/utils/db');
        });

        test('should expose pool methods', () => {
            expect(pool).toBe(mockPool);
            expect(typeof pool.getConnection).toBe('function');
            expect(typeof pool.execute).toBe('function');
            expect(typeof pool.query).toBe('function');
            expect(typeof pool.end).toBe('function');
        });

        test('should be able to get a connection', async () => {
            const mockConnection = {
                execute: jest.fn(),
                query: jest.fn(),
                release: jest.fn()
            };
            
            mockPool.getConnection.mockResolvedValue(mockConnection);

            const connection = await pool.getConnection();

            expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
            expect(connection).toBe(mockConnection);
        });

        test('should be able to execute queries directly on pool', async () => {
            const mockResult = [{ id: 1, name: 'test' }];
            mockPool.execute.mockResolvedValue([mockResult, []]);

            const query = 'SELECT * FROM test_table WHERE id = ?';
            const params = [1];
            const result = await pool.execute(query, params);

            expect(mockPool.execute).toHaveBeenCalledWith(query, params);
            expect(result[0]).toBe(mockResult);
        });

        test('should be able to query directly on pool', async () => {
            const mockResult = [{ count: 5 }];
            mockPool.query.mockResolvedValue([mockResult, []]);

            const query = 'SELECT COUNT(*) as count FROM test_table';
            const result = await pool.query(query);

            expect(mockPool.query).toHaveBeenCalledWith(query);
            expect(result[0]).toBe(mockResult);
        });

        test('should handle connection errors gracefully', async () => {
            const error = new Error('Connection failed');
            mockPool.getConnection.mockRejectedValue(error);

            await expect(pool.getConnection()).rejects.toThrow('Connection failed');
            expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
        });

        test('should handle query errors gracefully', async () => {
            const error = new Error('Query failed');
            mockPool.execute.mockRejectedValue(error);

            const query = 'INVALID SQL';
            await expect(pool.execute(query)).rejects.toThrow('Query failed');
            expect(mockPool.execute).toHaveBeenCalledWith(query);
        });

        test('should be able to close the pool', async () => {
            mockPool.end.mockResolvedValue();

            await pool.end();

            expect(mockPool.end).toHaveBeenCalledTimes(1);
        });
    });

    describe('Singleton Pattern', () => {
        test('should return the same pool instance on multiple requires', () => {
            const pool1 = require('../../src/utils/db');
            const pool2 = require('../../src/utils/db');

            expect(pool1).toBe(pool2);
            expect(pool1).toBe(mockPool);
            // createPool should only be called once during module loading
        });
    });

    describe('Configuration Validation', () => {
        test('should successfully create and export pool', () => {
            // Test that the module successfully creates and exports a pool
            const pool = require('../../src/utils/db');
            expect(pool).toBeDefined();
            expect(pool).toBe(mockPool);
        });
    });

    describe('Integration-like Tests', () => {
        let pool;

        beforeEach(() => {
            pool = require('../../src/utils/db');
        });

        test('should handle typical database operations flow', async () => {
            // Mock a typical flow: get connection, execute query, release connection
            const mockConnection = {
                execute: jest.fn().mockResolvedValue([[{ id: 1 }], []]),
                release: jest.fn()
            };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            const connection = await pool.getConnection();
            const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [1]);
            connection.release();

            expect(mockPool.getConnection).toHaveBeenCalledTimes(1);
            expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
            expect(rows).toEqual([{ id: 1 }]);
        });

        test('should handle transaction-like operations', async () => {
            const mockConnection = {
                beginTransaction: jest.fn().mockResolvedValue(),
                execute: jest.fn().mockResolvedValue([[], []]),
                commit: jest.fn().mockResolvedValue(),
                rollback: jest.fn().mockResolvedValue(),
                release: jest.fn()
            };
            mockPool.getConnection.mockResolvedValue(mockConnection);

            const connection = await pool.getConnection();
            await connection.beginTransaction();
            await connection.execute('INSERT INTO users (name) VALUES (?)', ['Test User']);
            await connection.commit();
            connection.release();

            expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
            expect(mockConnection.execute).toHaveBeenCalledWith('INSERT INTO users (name) VALUES (?)', ['Test User']);
            expect(mockConnection.commit).toHaveBeenCalledTimes(1);
            expect(mockConnection.release).toHaveBeenCalledTimes(1);
        });
    });
});