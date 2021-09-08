import argparse

import yaml
from symbolchain.core.BufferWriter import BufferWriter
from symbolchain.core.CryptoTypes import Hash256, PrivateKey, PublicKey, Signature
from symbolchain.core.nem.KeyPair import KeyPair
from symbolchain.core.nem.Network import Address, Network
from symbolchain.core.nem.TransferTransaction import TransferTransaction
from zenlog import log

MICROXEM_PER_XEM = 1000000


def attach_signature(payload, signature):
    writer = BufferWriter()
    writer.write_bytes(payload[0:48])

    writer.write_int(Signature.SIZE, 4)
    writer.write_bytes(signature.bytes)

    writer.write_bytes(payload[48:])
    return writer.buffer


class Generator:
    def __init__(self, input_file):
        with open(input_file, 'rt') as infile:
            nemesis_config = yaml.load(infile, yaml.SafeLoader)

            self.signer_key_pair = KeyPair(PrivateKey(nemesis_config['signer_private_key']))
            self.generation_hash = Hash256(nemesis_config['generation_hash'])
            self.accounts = nemesis_config['accounts']

        self.network = Network.TESTNET
        self.unsigned_transaction_payloads = []
        self.signed_transaction_payloads = []
        self.signed_block_header = None

    def print_header(self):
        log.info('Preparing Nemesis Block')
        log.info(' *  SIGNER ADDRESS: {}'.format(self.network.public_key_to_address(self.signer_key_pair.public_key)))
        log.info(' * GENERATION HASH: {}'.format(self.generation_hash))
        log.info(' *  TOTAL ACCOUNTS: {}'.format(len(self.accounts)))
        log.info(' *       TOTAL XEM: {:.6f}'.format(sum([account['amount'] for account in self.accounts]) / MICROXEM_PER_XEM))

    def prepare_transactions(self):
        for transaction_descriptor in self.accounts:
            self._serialize_and_sign_transaction(transaction_descriptor)

    def _serialize_and_sign_transaction(self, transaction_descriptor):
        transaction = TransferTransaction(self.network)
        transaction.signer_public_key = self.signer_key_pair.public_key
        transaction.recipient_address = Address(transaction_descriptor['address'])
        transaction.amount = transaction_descriptor['amount']
        unsigned_payload = transaction.serialize()

        self.unsigned_transaction_payloads.append(unsigned_payload)
        signature = self.signer_key_pair.sign(unsigned_payload)
        signed_payload = attach_signature(unsigned_payload, signature)
        self.signed_transaction_payloads.append(signed_payload)

    def prepare_block(self):
        writer = BufferWriter()
        writer.write_int(0xFFFFFFFF, 4)  # type
        self._write_entity_header(writer)

        writer.write_int(Hash256.SIZE, 4)
        writer.write_bytes(self.generation_hash.bytes)

        writer.write_int(1, 8)  # height

        writer.write_int(len(self.unsigned_transaction_payloads), 4)  # transactions count

        for unsigned_transaction_payload in self.unsigned_transaction_payloads:
            writer.write_bytes(unsigned_transaction_payload)

        unsigned_payload = writer.buffer
        signature = self.signer_key_pair.sign(unsigned_payload)
        self.signed_block_header = attach_signature(unsigned_payload, signature)

    def _write_entity_header(self, writer):
        writer.write_int(1, 2)  # version
        writer.write_int(self.network.identifier, 2)  # network
        writer.write_int(0, 4)  # timestamp

        writer.write_int(PublicKey.SIZE, 4)
        writer.write_bytes(self.signer_key_pair.public_key.bytes)

    def save(self, output_file):
        with open(output_file, 'wb') as outfile:
            outfile.write(self.signed_block_header)
            for signed_transaction_payload in self.signed_transaction_payloads:
                outfile.write(signed_transaction_payload)


def main():
    parser = argparse.ArgumentParser(
        prog=None if globals().get('__spec__') is None else 'python -m {}'.format(__spec__.name.partition('.')[0]),
        description='NEM nemesis block generator'
    )
    parser.add_argument('-i', '--input', help='nemesis configuration', required=True)
    parser.add_argument('-o', '--output', help='nemesis binary file', required=True)
    args = parser.parse_args()

    generator = Generator(args.input)
    generator.print_header()

    generator.prepare_transactions()
    generator.prepare_block()
    generator.save(args.output)


if '__main__' == __name__:
    main()
