from fastapi import APIRouter, Depends
from core import db, require
from .read_model import quality_board
from .schemas import Derivative, PackageSwitch
from .service import request_switch, submit, verify

router = APIRouter(prefix="/api/tape-preservation")

@router.get("")
def board(user=Depends(require())):
    with db() as cx:
        return quality_board(cx)

@router.post("/derivatives",status_code=201)
def add(data: Derivative,user=Depends(require("operator"))):
    with db() as cx:
        return submit(cx,data,user["email"])

@router.post("/derivatives/{identifier}/verify")
def check(identifier: int,user=Depends(require("reviewer"))):
    with db() as cx:
        return verify(cx,identifier,user["email"])

@router.post("/switches",status_code=201)
def switch_package(data: PackageSwitch,user=Depends(require("operator","reviewer"))):
    with db() as cx:
        return request_switch(cx,data,user["email"])
