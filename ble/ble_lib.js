"use strict";

class BLELib {
    static VERSION = 1;
    static debug = false;
    static AddrType = Object.freeze({
        UNKNOWN:                        Symbol('UNKNOWN'),
        STATIC_RANDOM:                  Symbol('STATIC_RANDOM'),
        RESOLVABLE_PRIVATE_RANDOM:      Symbol('RESOLVABLE_PRIVATE_RANDOM'),
        NON_RESOLVABLE_PRIVATE_RANDOM:  Symbol('NON_RESOLVABLE_PRIVATE_RANDOM'),
    });

    /**
     * Asserts that the given condition is true. If it isn't, an error message is printed to the console and an
     * exception is thrown.
     *
     * @param {boolean} condition Condition that must be true.
     * @param {string} msg Optional message to log/throw on failure.
     */
    static assert(condition, msg = null)
    {
        msg = `BLELib: ${msg || 'Assertion failed'}`;
        if (!condition) {
            console.error(msg);
            throw msg;
        }
    }

    /**
     * Converts a string containing any number of hex-digit pairs (separated by anything or nothing) to a byte array.
     *
     * @param {string} hex_string Input string.
     * @returns {Uint8Array} Output byte array.
     */
    static hex_to_bytes(hex_string)
    {
        const hex_pairs = hex_string.match(/[\da-fA-F]{2}/g) || [];
        return new Uint8Array(hex_pairs.map(hp => parseInt(hp, 16)));
    }

    /**
     * Converts a byte array to a hex string, optionally inserting separators between groups of bytes.
     *
     * @param {Uint8Array} bytes Input byte array.
     * @param {string} sep Optional separator string to insert between groups (default: single space).
     * @param {Array<number>} group_sizes Optional array of integers which cyclically specify the group sizes in bytes
     *                                    (default: [1], i.e. 1 byte per group for all groups).
     * @returns {string} Output hex string.
     */
    static bytes_to_hex(bytes, sep = ' ', group_sizes = [1])
    {
        BLELib.assert(group_sizes instanceof Array, 'group_sizes must be an Array');
        BLELib.assert(group_sizes.length > 0, 'group_sizes must have at least one element');
        const hex_groups = [];
        const hex_group = [];
        let group_size_index = 0;
        let group_size = group_sizes[group_size_index];
        for (const byte of bytes) {
            hex_group.push(byte.toString(16).padStart(2, '0'));
            group_size--;
            if (group_size <= 0) {
                hex_groups.push(hex_group.join(''));
                hex_group.length = 0;
                group_size_index = (group_size_index + 1) % group_sizes.length;
                group_size = group_sizes[group_size_index];
            }
        }
        if (hex_group.length > 0) {
            hex_groups.push(hex_group.join(''));
        }
        return hex_groups.join(sep);
    }

    /**
     * This is the security function "e" defined in BT Core spec v5.2 vol 3 part H section 2.2.1 (also the
     * HCI_LE_Encrypt command defined in BT Core v5.2 vol 4 part E section 7.8.22). Performs simple AES-128 encryption
     * of 128-bit data, i.e. ECB mode.
     *
     * @param {Uint8Array} key 16-byte AES key (big-endian).
     * @param {Uint8Array} plain_text_data 16-byte plaintext block (big-endian).
     * @returns {Promise<Uint8Array>} 16-byte ciphertext block (big-endian).
     */
    static async e(key, plain_text_data)
    {
        BLELib.assert(key.length == 16, 'key must be 16 bytes');
        BLELib.assert(plain_text_data.length == 16, 'plain_text_data must be 16 bytes');
        // The built-in Crypto library has no API for ECB mode, so instead we use the available CTR mode and bypass the
        // CTR functionality by using all zeroes as the CTR plain text and the actual plain text as the CTR counter.
        // This works because:
        //      ECB mode (desired):   output = AES-128(key, plain_text_data)
        //      CTR mode (available): output = plain_text_data XOR AES-128(key, counter)
        const ctr_counter = plain_text_data;
        const ctr_plain_text = new Uint8Array(16); // all-zeroes
        // Import the key into a CryptoKey object
        const key_encoded = await window.crypto.subtle.importKey(
            "raw",
            key.buffer,
            "AES-CTR",
            false,
            ["encrypt", "decrypt"],
        );
        // Do the AES encryption
        const encrypted_data = new Uint8Array(await window.crypto.subtle.encrypt(
            {
                name: "AES-CTR",
                counter: ctr_counter,
                length: 64 // size in bits of actual counter portion of counter; rest is nonce; irrelevant here
            },
            key_encoded,
            ctr_plain_text
        ));
        return encrypted_data;
    }

    /**
     * This is the random address hash function "ah" defined in BT Core spec v5.2 vol 3 part H section 2.2.2.
     *
     * @param {Uint8Array} k 16-byte key (big-endian).
     * @param {Uint8Array} r 3-byte random value (big-endian).
     * @returns {Promise<Uint8Array>} 3-byte hash value (big-endian).
     */
    static async ah(k, r)
    {
        BLELib.assert(k.length == 16, 'k must be 16 bytes');
        BLELib.assert(r.length == 3, 'r must be 3 bytes');
        const r_prime = new Uint8Array(16); // all-zeroes
        r_prime.set(r, 13);
        return (await BLELib.e(k, r_prime)).slice(-3);
    }

    /**
     * Determines the subtype of a given random address.
     *
     * @param {Uint8Array} addr 6-byte address (big-endian).
     * @returns {Symbol} One of the BLELib.AddrType values.
     */
    static rand_addr_type(addr)
    {
        BLELib.assert(addr.length == 6, 'addr must be 6 bytes');
        const type_bits = (addr[0] & 0xC0) >> 6;
        const upper_rand_bytes_ORed = (addr[0] & 0x3F) | addr[1] | addr[2];
        const upper_rand_bytes_ANDed = (addr[0] | 0xC0) & addr[1] & addr[2];
        if (type_bits == 0b01 && upper_rand_bytes_ORed != 0 && upper_rand_bytes_ANDed != 0xFF) {
            return BLELib.AddrType.RESOLVABLE_PRIVATE_RANDOM;
        }
        if ((type_bits == 0b00 || type_bits == 0b11)
                && (upper_rand_bytes_ORed | addr[3] | addr[4] | addr[5]) != 0
                && (upper_rand_bytes_ANDed & addr[3] & addr[4] & addr[5]) != 0xFF) {
            if (type_bits == 0b00) {
                return BLELib.AddrType.NON_RESOLVABLE_PRIVATE_RANDOM;
            } else {
                return BLELib.AddrType.STATIC_RANDOM;
            }
        }
        return BLELib.AddrType.UNKNOWN;
    }

    /**
     * Resolves a random address against a list of IRKs (BT Core spec v5.2 vol 6 part B section 1.3.2.3, but for our
     * purpose we will not terminate resolving when the first match is found). The address type is not checked.
     *
     * @param {Uint8Array} addr 6-byte resolvable private random address (big-endian).
     * @param {Array<Uint8Array>} irks Array of 16-byte IRKs (big-endian).
     * @returns {Promise<Array<Uint8Array>>} Array of matching IRKs (input IRKs are referenced, not copied).
     */
    static async resolve_address(addr, irks)
    {
        BLELib.assert(addr.length == 6, 'addr must be 6 bytes');
        const matching_irks = [];
        for (const irk of irks) {
            BLELib.assert(irk.length == 16, 'Each irk must be 16 bytes');
            const prand = addr.slice(0, 3);
            const addr_hash = addr.slice(3, 6);
            const computed_hash = await BLELib.ah(irk, prand);
            if (computed_hash.every((byte, index) => byte == addr_hash[index])) {
                matching_irks.push(irk);
            }
        }
        return matching_irks;
    }

    /**
     * Generates a resolvable private random address from a given IRK and optional random part (BT Core v5.2 vol 6 part
     * B section 1.3.2.2). If the random part is provided, only the 22 LSBs of it are used, and if these bits are all
     * zeroes or all ones, null is returned. If the random part is not provided, a random one is generated.
     *
     * @param {Uint8Array} irk 16-byte IRK (big-endian).
     * @param {Uint8Array} prand_rand optional 3-byte random part (big-endian).
     * @returns {Promise<Uint8Array>} 6-byte resolvable private random address (big-endian).
     */
    static async generate_resolvable_address(irk, prand_rand = undefined)
    {
        BLELib.assert(irk.length == 16, 'irk must be 16 bytes');
        let prand_rand_int;
        if (prand_rand === undefined) {
            // Generate a random 3-byte prand_rand whose 22 LSBs are not all zeroes or all ones (retry if that happens)
            prand_rand = new Uint8Array(3);
            do {
                crypto.getRandomValues(prand_rand);
                prand_rand_int = ((prand_rand[0] << 16) | (prand_rand[1] << 8) | prand_rand[2]) & 0x3FFFFF;
            } while (prand_rand_int == 0 || prand_rand_int == 0x3FFFFF);
        } else {
            BLELib.assert(prand_rand.length == 3, 'prand_rand must be 3 bytes');
            prand_rand_int = ((prand_rand[0] << 16) | (prand_rand[1] << 8) | prand_rand[2]) & 0x3FFFFF;
            if (prand_rand_int == 0 || prand_rand_int == 0x3FFFFF) {
                return null;
            }
        }
        // Set prand to prand_rand, and set the 2 MSBs to 0b01
        const prand = new Uint8Array(prand_rand);
        prand[0] = (prand[0] & 0x3F) | 0x40;
        // Compute the address hash
        const addr_hash = await BLELib.ah(irk, prand);
        // Construct the resolvable address from prand and addr_hash
        const resolvable_address = new Uint8Array(6);
        resolvable_address.set(prand, 0);
        resolvable_address.set(addr_hash, 3);
        return resolvable_address;
    }

    /**
     * Generates a non-resolvable private random address (BT Core v5.2 vol 6 part B section 1.3.2.2).
     *
     * @returns {Uint8Array} 6-byte non-resolvable private random address (big-endian).
     */
    static generate_non_resolvable_address()
    {
        const addr = new Uint8Array(6);
        // Repeat the address generation until the 46 LSBs are not all zeroes or all ones
        do {
            // Fill addr with 48 random bits, then set the 2 MSBs to 0b00 (non-resolvable private random address)
            crypto.getRandomValues(addr);
            addr[0] &= 0x3F;
        } while (((addr[0] & 0x3F) | addr[1] | addr[2] | addr[3] | addr[4] | addr[5]) == 0 ||
                 (addr[0] & addr[1] & addr[2] & addr[3] & addr[4] & addr[5]) == 0xFF);
        return addr;
    }

    /**
     * Generates a static random address (BT Core v5.2 vol 6 part B section 1.3.2.1).
     *
     * @returns {Uint8Array} 6-byte static random address (big-endian).
     */
    static generate_static_address()
    {
        // Generate a non-resolvable private random address, then set the 2 MSBs to 0b11 (static random address)
        const addr = BLELib.generate_non_resolvable_address();
        addr[0] |= 0xC0;
        return addr;
    }

    /**
     * Asserts that the given condition is true for the self-test with the given identifier. If it isn't, an exception
     * is thrown.
     *
     * @param {string} test_id Identifier for the self-test.
     * @param {boolean} condition Condition that must be true for the test to pass.
     */
    static st_assert(test_id, condition)
    {
        const msg = 'Self-test ' + test_id + (condition ? ' passed' : ' failed');
        BLELib.assert(condition, msg);
        if (BLELib.debug && condition) {
            console.info(`BLELib: ${msg}`);
        }
    }

    /**
     * Runs self-tests to verify correctness of this library and the underlying browser APIs.
     */
    static async self_test()
    {
        // Test vector for e() from FIPS-197 Appendix C.1
        {
            const key = new Uint8Array([
                0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f
            ]);
            const plain_text = new Uint8Array([
                0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff
            ]);
            const expected_e = new Uint8Array([
                0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a
            ]);
            const actual_e = await BLELib.e(key, plain_text);
            BLELib.st_assert('1.1', actual_e.every((byte, index) => byte === expected_e[index]));
        }
        // Test vector for ah() from BT Core v5.2 vol 3 part H appendix D.7
        {
            const irk = new Uint8Array([
                0xec, 0x02, 0x34, 0xa3, 0x57, 0xc8, 0xad, 0x05, 0x34, 0x10, 0x10, 0xa6, 0x0a, 0x39, 0x7d, 0x9b
            ]);
            const prand = new Uint8Array([0x70, 0x81, 0x94]);
            const expected_ah = new Uint8Array([0x0d, 0xfb, 0xaa]);
            const actual_ah = await BLELib.ah(irk, prand);
            BLELib.st_assert('2.1', actual_ah.every((byte, index) => byte === expected_ah[index]));
        }
        // Test rand_addr_type()
        {
            // Valid resolvable private random address
            let addr = BLELib.hex_to_bytes('40:01:02:32:e3:93');
            BLELib.st_assert('3.1', BLELib.rand_addr_type(addr) === BLELib.AddrType.RESOLVABLE_PRIVATE_RANDOM);
            // Invalid resolvable private random address (prand all zeroes)
            addr = BLELib.hex_to_bytes('40:00:00:22:c7:05');
            BLELib.st_assert('3.2', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);
            // Invalid resolvable private random address (prand all ones)
            addr = BLELib.hex_to_bytes('7f:ff:ff:70:43:99');
            BLELib.st_assert('3.3', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);

            // Valid non-resolvable private random address
            addr = BLELib.hex_to_bytes('3F:01:02:03:04:05');
            BLELib.st_assert('3.4', BLELib.rand_addr_type(addr) === BLELib.AddrType.NON_RESOLVABLE_PRIVATE_RANDOM);
            // Invalid non-resolvable private random address (random part all zeroes)
            addr = BLELib.hex_to_bytes('00:00:00:00:00:00');
            BLELib.st_assert('3.5', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);
            // Invalid non-resolvable private random address (random part all ones)
            addr = BLELib.hex_to_bytes('3F:FF:FF:FF:FF:FF');
            BLELib.st_assert('3.6', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);

            // Valid static random address
            addr = BLELib.hex_to_bytes('C0:1A:2B:3C:4D:5E');
            BLELib.st_assert('3.7', BLELib.rand_addr_type(addr) === BLELib.AddrType.STATIC_RANDOM);
            // Invalid static random address (random part all zeroes)
            addr = BLELib.hex_to_bytes('C0:00:00:00:00:00');
            BLELib.st_assert('3.8', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);
            // Invalid static random address (random part all ones)
            addr = BLELib.hex_to_bytes('FF:FF:FF:FF:FF:FF');
            BLELib.st_assert('3.9', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);

            // Address with invalid type bits
            addr = BLELib.hex_to_bytes('80:1A:2B:3C:4D:5E');
            BLELib.st_assert('3.10', BLELib.rand_addr_type(addr) === BLELib.AddrType.UNKNOWN);
        }
        // Test resolve_address()
        {
            const irks = [
                BLELib.hex_to_bytes('00010203:04050607:08090A0B:0C0D0E0F'),
                BLELib.hex_to_bytes('c0ca938922c729ccd3f4984d382b4bfe'),
                BLELib.hex_to_bytes('088D58EEBCF53855F79CE5070B57AD7F'),
            ];
            const addrs = [
                BLELib.hex_to_bytes('40:01:02:32:e3:93'),
                BLELib.hex_to_bytes('0x6d674a50da5a'),
            ];
            const expected_matches = [
                [irks[0]],
                [irks[1], irks[2]],
            ];
            for (let i = 0; i < addrs.length; i++) {
                const test_id = `4.${i + 1}`;
                const actual_matches = await BLELib.resolve_address(addrs[i], irks);
                const expected_matches_i = expected_matches[i];
                BLELib.st_assert(test_id,
                    actual_matches.length === expected_matches_i.length &&
                    actual_matches.every((irk, j) => irk === expected_matches_i[j]));
            }
        }
        // Test generate_resolvable_address()
        {
            const irk = BLELib.hex_to_bytes('c0ca938922c729ccd3f4984d382b4bfe');

            // Test with provided valid prand_rand
            let prand_rand = BLELib.hex_to_bytes('ed674a');
            const expected_addr = BLELib.hex_to_bytes('6d:67:4a:50:da:5a');
            const actual_addr1 = await BLELib.generate_resolvable_address(irk, prand_rand);
            BLELib.st_assert('5.1', actual_addr1.every((byte, index) => byte === expected_addr[index]));
            BLELib.st_assert('5.1b', BLELib.rand_addr_type(actual_addr1) === BLELib.AddrType.RESOLVABLE_PRIVATE_RANDOM);
            let matching_irks = await BLELib.resolve_address(actual_addr1, [irk]);
            BLELib.st_assert('5.1c', matching_irks.length == 1 && matching_irks[0] === irk);

            // Test with provided invalid prand_rand (all zeroes)
            prand_rand = BLELib.hex_to_bytes('00:00:00');
            let result = await BLELib.generate_resolvable_address(irk, prand_rand);
            BLELib.st_assert('5.2', result === null);

            // Test with provided invalid prand_rand (all ones)
            prand_rand = BLELib.hex_to_bytes('FF:FF:FF');
            result = await BLELib.generate_resolvable_address(irk, prand_rand);
            BLELib.st_assert('5.3', result === null);

            // Test with auto-generated prand_rand
            const actual_addr2 = await BLELib.generate_resolvable_address(irk);
            BLELib.st_assert('5.4', !actual_addr2.every((byte, index) => byte === actual_addr1[index]));
            BLELib.st_assert('5.4b', BLELib.rand_addr_type(actual_addr2) === BLELib.AddrType.RESOLVABLE_PRIVATE_RANDOM);
            matching_irks = await BLELib.resolve_address(actual_addr2, [irk]);
            BLELib.st_assert('5.4c', matching_irks.length == 1 && matching_irks[0] === irk);
        }
        // Test generate_non_resolvable_address()
        {
            const addr1 = BLELib.generate_non_resolvable_address();
            BLELib.st_assert('6.1', BLELib.rand_addr_type(addr1) === BLELib.AddrType.NON_RESOLVABLE_PRIVATE_RANDOM);
            const addr2 = BLELib.generate_non_resolvable_address();
            BLELib.st_assert('6.1b', !addr2.every((byte, index) => byte === addr1[index]));
            BLELib.st_assert('6.1c', BLELib.rand_addr_type(addr2) === BLELib.AddrType.NON_RESOLVABLE_PRIVATE_RANDOM);
        }
        // Test generate_static_address()
        {
            const addr1 = BLELib.generate_static_address();
            BLELib.st_assert('7.1', BLELib.rand_addr_type(addr1) === BLELib.AddrType.STATIC_RANDOM);
            const addr2 = BLELib.generate_static_address();
            BLELib.st_assert('7.1b', !addr2.every((byte, index) => byte === addr1[index]));
            BLELib.st_assert('7.1c', BLELib.rand_addr_type(addr2) === BLELib.AddrType.STATIC_RANDOM);
        }
        if (BLELib.debug) console.info('BLELib: All self-tests passed');
    }
}
