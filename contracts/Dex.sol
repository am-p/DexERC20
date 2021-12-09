pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Dex {

    enum Side {
        BUY,
        SELL
    }

    struct Order {
        uint id;
        address trader;
        Side side;
        bytes32 ticker;
        uint amount;
        uint filled;
        uint price;
        uint date;
    }

    struct Token {
        uint id;
        bytes32 ticker;
        address tokenAddress;
    }

    mapping(bytes32 => Token) public tokens;
    mapping(address => mapping(bytes32 => uint)) public traderBalances;
    mapping(bytes32 => mapping(uint => Order[])) public orderBook;

    bytes32[] public tokenList;

    bytes32 constant DAI = bytes32("DAI");
    address public admin;
    uint public nextTokenId;
    uint public nextOrderId;
    uint public nextTradeId;

    event NewTrade(
        uint tradeId,
        uint orderId,
        bytes32 indexed ticker,
        address indexed trader1,
        address indexed trader2,
        uint amount,
        uint price,
        uint date
    );

    constructor() {
        admin = msg.sender;
    }

    function addToken(bytes32 ticker, address tokenAddress) external onlyAdmin() {
        tokens[ticker] = Token(
            nextTokenId,
            ticker,
            tokenAddress
        );
        tokenList.push(ticker);
        nextTokenId++;
    }

    function deposit(bytes32 ticker, uint amount) external tokenExist(ticker) {
        IERC20(tokens[ticker].tokenAddress).transferFrom(msg.sender, address(this), amount);
        traderBalances[msg.sender][ticker] += amount;
    }

    function withdraw(bytes32 ticker, uint amount) external tokenExist(ticker) {
        require(traderBalances[msg.sender][ticker] >= amount, "Balance too low.");

        IERC20(tokens[ticker].tokenAddress).transfer(msg.sender, amount);
        traderBalances[msg.sender][ticker] -= amount;
    }

    function createLimitOrder(bytes32 ticker, uint amount, uint price, Side side) external tokenExist(ticker) tokenIsNotDai(ticker) {

        if (side == Side.SELL) {
            require(traderBalances[msg.sender][ticker] >= amount, "Token balance too low.");

        } else {
            require(traderBalances[msg.sender][DAI] >= amount * price, "DAI balance too low.");
        }

        Order[] storage orders = orderBook[ticker][uint(side)];
        orders.push(Order(
            nextOrderId,
            msg.sender,
            side,
            ticker,
            amount,
            0,
            price,
            block.timestamp //now is deprecated
        ));
        nextOrderId++;

        uint i = orders.length - 1;
        while(i > 0) {
            if (side == Side.BUY && orders[i - 1].price > orders[i].price) {
                break;
            }
            if (side == Side.SELL && orders[i - 1].price < orders[i].price) {
                break;
            }
            Order memory order = orders[i - 1];
            orders[i - 1] = orders[i];
            orders[i] = order;
            i--;
        }
    }

    function createMarketOrder(bytes32 ticker, uint amount, Side side) external tokenExist(ticker) tokenIsNotDai(ticker) {
        if (side == Side.SELL) {
            require(traderBalances[msg.sender][ticker] >= amount, "Token balance too low.");
        }
        Order[] storage orders = orderBook[ticker][uint(side == Side.BUY ? Side.SELL : Side.BUY)];
        uint i;
        uint remaining = amount;

        while(i < orders.length && remaining > 0) {
            uint available = orders[i].amount - orders[i].filled;
            uint matched = (remaining > available) ? available : remaining;
            remaining -= matched;
            orders[i].filled += matched;
            emit NewTrade(nextTradeId, orders[i].id, ticker, orders[i].trader, msg.sender, matched, orders[i].price, block.timestamp);
            if(side == Side.SELL) {
                traderBalances[msg.sender][ticker] -= matched;
                traderBalances[msg.sender][DAI] += matched * orders[i].price;
                traderBalances[orders[i].trader][ticker] += matched;
                traderBalances[orders[i].trader][DAI] -= matched * orders[i].price;
            }
            if(side == Side.BUY) {
                require(traderBalances[msg.sender][DAI] >= matched * orders[i].price, "DAI balance too low.");
                traderBalances[msg.sender][ticker] += matched;
                traderBalances[msg.sender][DAI] -= matched * orders[i].price;
                traderBalances[orders[i].trader][ticker] -= matched;
                traderBalances[orders[i].trader][DAI] += matched * orders[i].price;
            }
            nextTradeId++;
            i++;
        }
        i = 0;
        while(i < orders.length && orders[i].filled == orders[i].amount) {
            for (uint j=0; j < orders.length - 1; j++) {
                orders[j] = orders[j + 1];
            }
            orders.pop();
            i++;
        }
    }

    function getOrders(bytes32 ticker, Side side) external view returns (Order[] memory) {
        return orderBook[ticker][uint(side)];
    }

    function getTokens() external view returns (Token[] memory) {
      Token[] memory _tokens = new Token[](tokenList.length);
      for (uint i=0; i < tokenList.length; i++) {
        _tokens[i] = Token(
          tokens[tokenList[i]].id,
          tokens[tokenList[i]].ticker,
          tokens[tokenList[i]].tokenAddress
        );
      }
      return _tokens;
    }

    function getTokensList() external view returns (bytes32[] memory) {
        return tokenList;
    }

    modifier tokenIsNotDai(bytes32 ticker) {
        require(ticker != DAI, "Cannot trade DAI");
        _;
    }

    modifier tokenExist(bytes32 ticker) {
        require(tokens[ticker].tokenAddress != address(0), "This token dosn't exist.");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin allowed.");
        _;
    }
}
