import nem from 'nem-sdk';

class createMosaicCtrl {

    /**
     * Initialize dependencies and properties
     *
     * @params {services} - Angular services to inject
     */
    constructor(Wallet, Alert, DataStore, $filter, $timeout) {
        'ngInject';

        //// Module dependencies region ////

        this._Alert = Alert;
        this._Wallet = Wallet;
        this._DataStore = DataStore;
        this._$filter = $filter;
        this._$timeout = $timeout;

        //// End dependencies region ////

        //// Module properties region ////

        // Form is a namespace provision transaction object 
        this.formData = nem.model.objects.get("mosaicDefinitionTransaction");

        // Sink account for view
        this.formData.mosaicFeeSink = nem.model.sinks.mosaic[this._Wallet.network];

        // Current address as default levy recipient
        this.formData.levy.address = this._Wallet.currentAccount.address;

        // Set first multisig account if any
        this.formData.multisigAccount = this._DataStore.account.metaData.meta.cosignatoryOf.length == 0 ? '' : this._DataStore.account.metaData.meta.cosignatoryOf[0];

        // Has no levy by default
        this.hasLevy = false;

        // Mosaics owned names for current account
        this.currentAccountMosaicNames = '';

        // Selected mosaic from view
        this.selectedMosaic = '';

        // Needed to prevent user to click twice on send when already processing
        this.okPressed = false;

        // Character counter
        this.charsLeft = 512;

        // Object to contain our password & private key data.
        this.common = nem.model.objects.get("common");

        // Default namespaces owned
        this.namespaceOwned = this._DataStore.namespace.ownedBy[this._Wallet.currentAccount.address];

        // Default mosaics used
        this.mosaicOwned = this._DataStore.mosaic.ownedBy[this._Wallet.currentAccount.address];

        // Store the prepared transaction
        this.preparedTransaction = {};

        //// End properties region ////

        // Get mosaics and namespaces for current account
        this.updateCurrentAccountNSM();

        // Update the fee in view
        this.prepareTransaction();
    }

    //// Module methods region ////

    /**
     * Set name to lowercase and check it
     */
    processMosaicName(){
        // Lowercase mosaic name
        this.formData.mosaicName = this._$filter('lowercase')(this.formData.mosaicName);
        // Check mosaic name validity
        if(!this.mosaicIsValid(this.formData.mosaicName)) {
            this._Alert.invalidMosaicName();
            return;
        }
        this.prepareTransaction();
    }

    /**
     * Check description
     */
    processMosaicDescription() {
        if (!this.mosaicDescriptionIsValid(this.formData.mosaicDescription)) return this._Alert.invalidMosaicDescription();
        this.prepareTransaction();
    }

    /**
     * Update levy mosaic data
     *
     * @note: Used in view (ng-update) on hasLevy and selectedMosaic changes
     *
     * @param {boolean} val - true or false
     */
    updateLevyMosaic(val) {
        if (val) {
            this.formData.levy.mosaic = this.mosaicOwned[this.selectedMosaic].mosaicId;
        } else {
            this.formData.levy.mosaic = null;
        }
    }

    /**
     * Get current account namespaces & mosaic names
     *
     * @note: Used in view (ng-update) on multisig changes
     */
    updateCurrentAccountNSM() {
        // Get current account
        let acct = this.formData.isMultisig ? this.formData.multisigAccount.address : this._Wallet.currentAccount.address;

        // Set current account mosaics names if mosaicOwned is not undefined
        if (undefined !== this._DataStore.mosaic.ownedBy[acct]) {
            this.currentAccountMosaicNames = Object.keys(this._DataStore.mosaic.ownedBy[acct]).sort();
            this.mosaicOwned = this._DataStore.mosaic.ownedBy[acct];
        } else {
            // 'nem:xem' is default
            this.currentAccountMosaicNames = ['nem:xem'];
            this.mosaicOwned = {};
        }
        
        // Default mosaic selected
        this.selectedMosaic = "nem:xem";

        // Set current account mosaics names if namespaceOwned is not undefined
        if (undefined !== this._DataStore.namespace.ownedBy[acct]) {
            this.namespaceOwned = this._DataStore.namespace.ownedBy[acct];
            this.formData.namespaceParent = this.namespaceOwned[Object.keys(this.namespaceOwned)[0]];
        } else {
            this._Alert.noNamespaceOwned();
            this.formData.namespaceParent = '';
        }
        this.prepareTransaction();
    }

     /**
     * Check validity of mosaic name
     */
    mosaicIsValid(m) {
        // Test if correct length and if name starts with hyphens
        if (m.length > 32 || /^([_-])/.test(m)) return false;

        let pattern = /^[a-z0-9\-_]*$/;

        // Test if has special chars or space excluding hyphens
        if (pattern.test(m) == false) {
            return false;
          } else {
            return true;
          }
    }

    /**
     * Check validity of mosaic description
     */
    mosaicDescriptionIsValid(m) {
        // Test if correct length
        if (m.length > 512) return false;
        return true;
    }

    /**
     * Prepare the transaction
     */
    prepareTransaction() {
        let entity = nem.model.transactions.prepare("mosaicDefinitionTransaction")(this.common, this.formData, this._Wallet.network);
        // Update characters left
        if (this.formData.isMultisig) {
            this.charsLeft = entity.otherTrans.mosaicDefinition.description.length ? 512 - entity.otherTrans.mosaicDefinition.description.length : 512;
        } else {
            this.charsLeft = entity.mosaicDefinition.description.length ? 512 - entity.mosaicDefinition.description.length : 512;
        }
        // Store the prepared transaction
        this.preparedTransaction = entity;
        return entity;
    }

    /**
     * Reset data
     */
    resetData() {
        this.formData = nem.model.objects.get("mosaicDefinitionTransaction");
        this.common = nem.model.objects.get("common");
        this.preparedTransaction = {};
        this.prepareTransaction();
    }

    /**
     * Prepare and broadcast the transaction to the network
     */
    send() {
        // Disable send button;
        this.okPressed = true;

        // Get account private key for preparation or return
        if (!this._Wallet.decrypt(this.common)) return this.okPressed = false;

        // Build the entity to serialize
        let entity = this.prepareTransaction();

        // Use wallet service to serialize and send
        this._Wallet.transact(this.common, entity).then(() => {
            this._$timeout(() => {
                // Enable send button
                this.okPressed = false;
                // Reset form data
                this.resetData();
                return;
            });
        }, () => {
            this._$timeout(() => {
                // Delete private key in common
                this.common.privateKey = '';
                // Enable send button
                this.okPressed = false;
                return;
            });
        });
    }

    //// End methods region ////

}

export default createMosaicCtrl;
