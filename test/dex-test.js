const { expect } = require("chai");
const { ethers, web3 } = require("hardhat");

describe("Dex", function () {
    let Dex, Bat, Dai, Rep, Zrx;
    let dex, bat, dai, rep, zrx;
    let trader1, trader2;
    const [DAI, BAT, REP, ZRX, NEX] = ["DAI", "BAT", "REP", "ZRX", "NEX"].map(ticker => web3.utils.asciiToHex(`${ticker}\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0`)); 
    // \0 porque le faltaban 58 caracteres para que lo considere un bytes32 valido
    const SIDE = {
        BUY: 0,
        SELL: 1
    }
    beforeEach(async function () {
        //Contracs and Mocks deploy
        Dex = await ethers.getContractFactory("Dex");
        Bat = await ethers.getContractFactory("Bat");
        Dai = await ethers.getContractFactory("Dai");
        Rep = await ethers.getContractFactory("Rep");
        Zrx = await ethers.getContractFactory("Zrx");
        dex = await Dex.deploy();
        bat = await Bat.deploy();
        dai = await Dai.deploy();
        rep = await Rep.deploy();
        zrx = await Zrx.deploy();
        await dex.addToken(DAI, dai.address);
        await dex.addToken(BAT, bat.address);
        await dex.addToken(REP, rep.address);
        await dex.addToken(ZRX, zrx.address);
        //Assign addresses
        [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
        [trader1, trader2] = [addr1, addr2];
        //Assign balance to each trader
        const amount = web3.utils.toWei("1000");
        const seedTokenBalance = async (token, trader) => {
            await token.faucet(trader.address, amount);
            await token.connect(trader).approve(
                dex.address,
                amount,
            );
        };
        await Promise.all(
            [dai, bat, rep, zrx].map(
              token => seedTokenBalance(token, trader1) 
            )
        );
        await Promise.all(
            [dai, bat, rep, zrx].map(
              token => seedTokenBalance(token, trader2) 
            )
        );
    });
    it("should deposit tokens", async function () {
        const amount = web3.utils.toWei("100");
        await dex.connect(trader1).deposit(DAI, amount);
        const balance = await dex.traderBalances(trader1.address, DAI);
        expect(balance.toString()).to.equal(amount);
    })
    it("should NOT deposit tokens if token dosn't exist", async function () {
        const amount = web3.utils.toWei("100");
        await expect(
            dex.connect(trader1).deposit(NEX, amount)
        ).to.be.revertedWith("This token dosn't exist.")
    })
    it("should withdraw tokens", async function () {
        const amount = web3.utils.toWei("100");
        await dex.connect(trader1).deposit(DAI, amount);
        await dex.connect(trader1).withdraw(DAI, amount);
        const balanceDex = await dex.traderBalances(trader1.address, DAI);
        const balanceDai = await dai.balanceOf(trader1.address)
        expect(balanceDex.toString()).to.equal("0");
        expect(balanceDai.toString()).to.equal(web3.utils.toWei("1000"))
    })
    it("should NOT withdraw tokens if token does not exist", async function () {
        const amount = web3.utils.toWei("100");
        await dex.connect(trader1).deposit(DAI, amount);
        await expect(
            dex.connect(trader1).withdraw(NEX, amount)
        ).to.be.revertedWith("This token dosn't exist.")
    })
    it("should NOT withdraw tokens if balance is too low", async function () {
        const amountDeposit = web3.utils.toWei("10");
        const amountWithdraw = web3.utils.toWei("100")
        await dex.connect(trader1).deposit(DAI, amountDeposit);
        await expect(
            dex.connect(trader1).withdraw(DAI, amountWithdraw)
        ).to.be.revertedWith("Balance too low.")
    })
    it("should create a limit order", async function () {
        //First
        const amount = web3.utils.toWei("100");
        const amountOrder = web3.utils.toWei("10");
        await dex.connect(trader1).deposit(DAI, amount);
        await dex.connect(trader1).createLimitOrder(REP, amountOrder, 10, SIDE.BUY);
        const ordersBuy = await dex.getOrders(REP, SIDE.BUY);
        expect(ordersBuy.length).to.equal(1);
        expect(ordersBuy[0].trader).to.equal(trader1.address);
        expect(ordersBuy[0].side).to.equal(0);
        expect(ordersBuy[0].amount).to.equal(amountOrder);
        expect(ordersBuy[0].filled).to.equal(0);
        expect(ordersBuy[0].price).to.equal(10);
        //Second
        const amount2 = web3.utils.toWei("200");
        await dex.connect(trader2).deposit(DAI, amount2);
        await dex.connect(trader2).createLimitOrder(REP, amountOrder, 11, SIDE.BUY);
        const ordersBuy2 = await dex.getOrders(REP, SIDE.BUY);
        expect(ordersBuy2.length).to.equal(2);
        expect(ordersBuy2[0].trader).to.equal(trader2.address);
        expect(ordersBuy2[0].side).to.equal(0);
        expect(ordersBuy2[0].amount).to.equal(amountOrder);
        expect(ordersBuy2[0].filled).to.equal(0);
        expect(ordersBuy2[0].price).to.equal(11);
    })
    it("should NOT create a limit order if the token dosn't exist", async function () {
        const amount = web3.utils.toWei("100");
        const amountOrder = web3.utils.toWei("10");
        await dex.connect(trader1).deposit(DAI, amount);
        await expect(
            dex.connect(trader1).createLimitOrder(NEX, amountOrder, 10, SIDE.BUY)
        ).to.be.revertedWith("This token dosn't exist.")
    })
    it("should NOT create a limit order if the token balance is too low", async function () {
        const amount = web3.utils.toWei("10");
        const amountOrder = web3.utils.toWei("100");
        await dex.connect(trader1).deposit(REP, amount);
        await expect(
            dex.connect(trader1).createLimitOrder(REP, amountOrder, 10, SIDE.SELL)
        ).to.be.revertedWith("Token balance too low.")
    })
    it("should NOT create a limit order if token is DAI", async function () {
        const amountOrder = web3.utils.toWei("10");
        await expect(
            dex.connect(trader1).createLimitOrder(DAI, amountOrder, 10, SIDE.BUY)
        ).to.be.revertedWith("Cannot trade DAI")
    })
    it("should NOT create a limit order is the DAI balance is too low", async function () {
        const amount = web3.utils.toWei("100");
        const amountOrder = web3.utils.toWei("10");
        await dex.connect(trader1).deposit(DAI, amount);
        await expect(
            dex.connect(trader1).createLimitOrder(REP, amountOrder, 20, SIDE.BUY)
        ).to.be.revertedWith("DAI balance too low.")
    })
    it("should create market order and match against existing limit order", async function () {
        const amount = web3.utils.toWei("100");
        const amountOrder = web3.utils.toWei("10");
        const amountOrder2 = web3.utils.toWei("5");
        await dex.connect(trader1).deposit(DAI, amount);
        await dex.connect(trader1).createLimitOrder(REP, amountOrder, 10, SIDE.BUY);
        await dex.connect(trader2).deposit(REP, amount);
        await dex.connect(trader2).createMarketOrder(REP, amountOrder2, SIDE.SELL);
        const balanceTrader1Dai = await dex.traderBalances(trader1.address, DAI);
        const balanceTrader1Rep = await dex.traderBalances(trader1.address, REP);
        const balanceTrader2Dai = await dex.traderBalances(trader2.address, DAI);
        const balanceTrader2Rep = await dex.traderBalances(trader2.address, REP);
        const ordersBuy = await dex.getOrders(REP, SIDE.BUY);
        expect(ordersBuy[0].side).to.equal(0);
        expect(ordersBuy[0].filled).to.equal(web3.utils.toWei("5"));
        expect(balanceTrader1Dai.toString()).to.equal(web3.utils.toWei("50"));
        expect(balanceTrader1Rep.toString()).to.equal(web3.utils.toWei("5"));
        expect(balanceTrader2Dai.toString()).to.equal(web3.utils.toWei("50"));
        expect(balanceTrader2Rep.toString()).to.equal(web3.utils.toWei("95"));
        
    })
    it("should NOT create market order if token dosn't exist", async function () {
        const amount = web3.utils.toWei("100");
        await expect(
            dex.createMarketOrder(NEX, amount, SIDE.BUY)
        ).to.be.revertedWith("This token dosn't exist.")
    })
    it("should NOT create maker order if token is DAI", async function () {
        const amount = web3.utils.toWei("100");
        await expect(
            dex.createMarketOrder(DAI, amount, SIDE.BUY)
        ).to.be.revertedWith("Cannot trade DAI")
    })
    it("shoudl NOT create market order if token balance is too low", async function () {
        const amount = web3.utils.toWei("99");
        const amountOrder = web3.utils.toWei("100");
        await dex.connect(trader1).deposit(DAI, amount);
        await expect(
            dex.createMarketOrder(REP, amountOrder, SIDE.SELL)
        ).to.be.revertedWith("Token balance too low.")
    })
    it("should NOT create market order if DAI balance is too low", async function () {
        const amount = web3.utils.toWei("100");
        const amountOrder = web3.utils.toWei("100");
        await dex.connect(trader1).deposit(REP, amount);
        await dex.connect(trader1).createLimitOrder(REP, amountOrder, 10, SIDE.SELL);
        await expect(
            dex.connect(trader2).createMarketOrder(REP, amountOrder, SIDE.BUY)
        ).to.be.revertedWith("DAI balance too low.")
    })
})
